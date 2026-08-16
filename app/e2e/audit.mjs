/**
 * Accessibility probe: drives the app and reports names, nested interactive
 * elements, live regions, tap-target sizes and reflow per screen.
 *
 * Kept rather than rewritten each time — re-deriving the auth flow and the seed
 * data is most of the cost of an audit. Companion to `drive.mjs`, which is for
 * looking at screens; this one is for interrogating them.
 *
 * Needs both dev servers up, and a server started with RESEND_WEBHOOK_SECRET if
 * you want the inbound path exercised. See the header of drive.mjs.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const LOG='/tmp/rev/server.log', BASE='http://localhost:5173', API='http://localhost:8787';
const SECRET = readFileSync('/tmp/rev/secret','utf8').trim();
const EMAIL = `rev+${Date.now()}@example.com`;
const shot = async (p,n)=>{ await p.screenshot({path:`/tmp/rev/shots/${n}.png`,fullPage:true}); console.log('  shot:',n); };

// Push a signed inbound webhook so the Inbox has something in it.
async function injectImport(messageId, from) {
  const body = JSON.stringify({ data: { email_id: messageId } });
  const id='msg_'+messageId, ts=String(Math.floor(Date.now()/1000));
  const key=Buffer.from(SECRET.replace(/^whsec_/,''),'base64');
  const sig=createHmac('sha256',key).update(`${id}.${ts}.${body}`).digest('base64');
  const r = await fetch(`${API}/api/webhooks/resend-inbound`,{method:'POST',
    headers:{'content-type':'application/json','svix-id':id,'svix-timestamp':ts,'svix-signature':`v1,${sig}`},body});
  console.log(`  webhook ${messageId} -> ${r.status}`, await r.text());
}

const b = await chromium.launch({ channel:'chrome' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>m.type()==='error'&&errors.push(m.text()));

await page.goto(`${BASE}/register`);
await page.locator('input[type=email]').fill(EMAIL);
await page.locator('input[type=password]').fill('correct horse battery');
await page.getByRole('button',{name:/create account/i}).click();
await page.getByText(/check your email/i).waitFor();
const tok=[...readFileSync(LOG,'utf8').matchAll(/verify\?token=([\w-]+)/g)].at(-1)?.[1];
await page.goto(`${BASE}/verify?token=${tok}`); await page.waitForURL(`${BASE}/`);

await page.getByRole('link',{name:/new trip/i}).click();
await page.locator('input').first().fill('Lisbon');
await page.locator('input[type=date]').first().fill('2026-09-10');
await page.locator('input[type=date]').nth(1).fill('2026-09-18');
await page.locator('select').selectOption('Europe/Lisbon').catch(()=>{});
await page.getByRole('button',{name:/create trip/i}).click();
await page.waitForURL(/\/trips\/trp_/);
const trip = page.url();

console.log('--- notification settings ---');
await page.waitForTimeout(800);
await shot(page,'01-trip-with-notifications');
const box = await page.locator('section.card').filter({hasText:'Reminders'}).boundingBox();
if (box) { await page.screenshot({path:'/tmp/rev/shots/02-notifications-closeup.png', clip:box}); console.log('  shot: 02-notifications-closeup'); }

console.log('--- seed the inbox ---');
await injectImport('em_flight', EMAIL);
await injectImport('em_junk', EMAIL);

await page.getByRole('link',{name:'Inbox'}).click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(600);
await shot(page,'03-inbox');

console.log('--- a11y probe on the two new screens ---');
const audit = async (label) => {
  const rows = await page.evaluate(()=>[...document.querySelectorAll('input,select,textarea,button,a[href]')].map(el=>{
    const id=el.id, f=id?document.querySelector(`label[for="${CSS.escape(id)}"]`):null, w=el.closest('label');
    const name=(el.getAttribute('aria-label')??f?.textContent??w?.textContent??el.textContent??'').trim().replace(/\s+/g,' ');
    return {tag:el.tagName.toLowerCase(),name:name.slice(0,60),len:name.length};
  }));
  console.log(`  -- ${label}`);
  rows.forEach(r=>console.log(`    ${r.len===0?'NO NAME  ':r.len>55?'LONG NAME':'         '} <${r.tag}> "${r.name}"`));
  console.log('    nested interactive (a>button):', await page.evaluate(()=>document.querySelectorAll('a button, button a').length));
  console.log('    live regions:', await page.evaluate(()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].length));
  const small = await page.evaluate(()=>[...document.querySelectorAll('button,a[href],select,input')].map(el=>{
    const r=el.getBoundingClientRect(); return {t:(el.textContent??'').trim().slice(0,18),w:Math.round(r.width),h:Math.round(r.height)};
  }).filter(x=>x.h>0&&(x.h<44||x.w<44)));
  console.log('    targets <44px:', small.length? small.map(s=>`${s.w}x${s.h} "${s.t}"`).join(', ') : 'none');
  const of = await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  console.log('    overflow:', of.sw>of.cw+1 ? `HORIZONTAL (${of.sw}>${of.cw})` : 'none');
};
await audit('inbox');
await page.goto(trip); await page.waitForTimeout(800);
await audit('trip detail incl. notification settings');

console.log('--- 320px reflow on the inbox ---');
await page.goto(`${BASE}/imports`); await page.waitForTimeout(600);
await page.setViewportSize({width:320,height:800}); await page.waitForTimeout(400);
const nar = await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
console.log('  320px:', nar.sw>nar.cw+1?`HORIZONTAL SCROLL (${nar.sw}>${nar.cw})`:'ok');
await shot(page,'04-inbox-320');

console.log(errors.length?`\nCONSOLE ERRORS:\n${errors.join('\n')}`:'\nNo console errors.');
await b.close();
