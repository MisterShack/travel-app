# Domains and DNS

> **This document owns the domain layout and every DNS record Wayleaf depends on.**
> `platform-engineer` maintains it. It exists because DNS is dashboard state, and this project's
> predecessor learned three times that dashboard state fails *silently* and in the direction that
> looks healthy.
>
> Written 2026-09-03, when `wayleaf.app` and `wayleaf.ca` were registered.

## 1. The domains

| Domain | Role | Status |
|---|---|---|
| **`wayleaf.app`** | **Primary. Everything lives here.** The site, the app's API, the email pipeline, every canonical URL | Registered 2026-09-03 |
| `wayleaf.ca` | Defensive. **301 redirects to `wayleaf.app`**, path and query preserved | Registered 2026-09-03; redirect not yet configured |
| `wayleaf.com` | Not held. Appeared unregistered on 2026-09-03 — worth grabbing at retail if still free, and redirecting the same way | Open |

**`.app` is primary — decided 2026-09-03.** It is already what `site/astro.config.mjs` declares, so
the canonical link, the sitemap and every Open Graph URL point there. **Changing the primary later
is not a config edit** — it invalidates every indexed URL, every social card, and every link anyone
has shared. Treat it as settled.

**One thing `.app` gives you for free and one it takes away.** `.app` is on the HSTS preload list
*at the TLD level*, so every browser refuses plain HTTP to any `wayleaf.app` hostname before a
request is made. There is no HTTP fallback and no way to opt out — which is a real security win, and
it means **every subdomain must have a valid certificate before it serves anything at all**. A
subdomain that is not on Cloudflare's Universal SSL will not "work badly"; it will not work.

## 2. Records

| Host | Type | Points at | Notes |
|---|---|---|---|
| `wayleaf.app` | — | Cloudflare Pages | The public site. Pages creates the record when the custom domain is added |
| `www.wayleaf.app` | — | redirect → apex | 301. The canonical is the apex; pick one and be consistent |
| `wayleaf.app` | **MX** | Email Routing (later: Fastmail) | **Human mail only.** `hello@wayleaf.app` |
| `in.wayleaf.app` | **MX** | Resend inbound | **The import pipeline.** Per-user forwarding addresses live here |
| `send.wayleaf.app` | TXT (SPF, DKIM, DMARC) | Resend | Transactional sending. No MX — it only sends |

### The MX conflict, which is the trap this table exists to prevent

**A hostname has one set of MX records.** Resend's inbound webhook needs MX to receive forwarded
confirmations. A real mailbox needs MX to receive human mail. **They cannot both own the apex**, and
whichever is configured second silently takes the first one's mail.

Waypoint brushed this and wrote it down: one of its import gates exists because "an MX on the
sending domain delivers replies to our own `no-reply` too". The fix is the split above — humans on
the apex, the pipeline on `in.`, and nothing on `send.` but text records.

**And keep transactional sending off the apex.** If bulk mail and human mail share a domain, a
deliverability problem in one poisons the other, and the domain a customer emails you at is the
worse half to lose.

## 3. The `wayleaf.ca` redirect

**Do it at Cloudflare with a Redirect Rule. Do not use the registrar's URL forwarding.**

Registrar forwarding is commonly a 302 and commonly drops the path, so `wayleaf.ca/privacy/` lands
on the homepage and search engines treat the redirect as temporary — which means the destination
never inherits the link equity, which is the entire reason for owning the domain.

1. Add `wayleaf.ca` to Cloudflare as a zone and point its nameservers there. (`.ca` is CIRA-run with
   Canadian presence requirements and is often registered elsewhere — that is fine. The registrar
   and the DNS host do not have to be the same.)
2. Wait for Universal SSL to issue. **The redirect cannot serve over HTTPS before the certificate
   exists**, and a browser reaching a `.ca` with no cert sees a warning, not a redirect.
3. Turn on **Always Use HTTPS** for the zone.
4. Add a Redirect Rule: match hostname `wayleaf.ca` or `www.wayleaf.ca` →
   `https://wayleaf.app${path}${query}`, **301 permanent, preserve path and query string**.
5. Verify all four, and check the status code rather than the rendered page:
   ```
   curl -sI https://wayleaf.ca/          | head -2
   curl -sI https://wayleaf.ca/privacy/  | head -2   # must land on /privacy/, not /
   curl -sI https://www.wayleaf.ca/      | head -2
   curl -sI http://wayleaf.ca/           | head -2
   ```
   A `302` or a `Location:` without the path is the failure, and it looks like success in a browser.

**Never let `wayleaf.ca` serve the site.** Two hostnames serving identical content is duplicate
content, splits ranking, and gives people a second URL to share that we do not control the future of.
It redirects or it does nothing.

## 4. Terraform, if it happens

Cloudflare's provider is one of the good ones and DNS-as-code is lower risk than the whole-project
IaC that Waypoint's Phase 6 was closed to avoid. Two rules if it is adopted:

- **An apply must never own the registrar lock or the nameservers.** Those are the two settings whose
  loss is not recoverable by a subsequent apply.
- **Assert the MX records exist rather than only declaring them.** An apply that removes MX stops
  mail *silently* — no error, no alert, and the import pipeline simply receives nothing. That is the
  same failure shape as a healthcheck pointed at the wrong path: it fails in the direction that
  looks fine. Waypoint's answer was a read-only drift checker that exits non-zero for *could not
  check* and never folds that into clean. Carry the pattern.
