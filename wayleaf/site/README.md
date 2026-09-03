# `@wayleaf/site` — the public page

Static marketing page and the policies. **Not an app** (PLAN §2k). Astro, zero client JavaScript,
three routes: `/`, `/privacy/`, `/thanks/`.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/
```

## Why Astro rather than a hand-written HTML file

The page has to grow into the policies, the App Store links, and eventually the content marketing in
BUSINESS-PLAN §10.3. Astro ships **no JavaScript by default**, so a plain page stays a plain page,
and the sitemap, layouts and content collections are there when the second and tenth pages arrive.
A hand-written file would have to be rewritten at exactly the moment there is no time to.

## Deploying — Cloudflare Pages

Chosen over serving from the API origin so that a copy tweak does not trigger an API deploy against
live data, and because it is a free static host on infrastructure Wayleaf already uses for R2.
**SSL and the certificate are automatic** — Cloudflare provisions and renews; there is nothing to
configure and nothing to remember to renew.

1. **Create the project.** Cloudflare dashboard → Workers & Pages → Create → Pages → connect the
   Git repo.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Root directory: `site`
2. **Custom domain.** Pages project → Custom domains → add `wayleaf.app` and `www.wayleaf.app`.
   If the domain's nameservers are already Cloudflare's, the DNS records and the certificate are
   created for you. Set a redirect so exactly one of the two is canonical — the `<link rel=canonical>`
   in `src/layouts/Base.astro` says the apex, so redirect `www` → apex.
3. **Waitlist storage.** Workers & Pages → KV → create a namespace named `wayleaf-waitlist`, then in
   the Pages project → Settings → Functions → KV namespace bindings, bind it as **`WAITLIST`**.
   Do this **before** announcing the page anywhere.
4. **Verify**, in this order, and do not skip the third:
   - `curl -sI https://wayleaf.app | head -1` → `HTTP/2 200`
   - `curl -s https://wayleaf.app/robots.txt` and `/sitemap-index.xml` both resolve
   - **Submit the form and read the value back out of KV.** A waitlist that silently drops
     addresses looks exactly like a waitlist nobody has signed up to.

### The failure this is built to avoid

`functions/api/waitlist.js` returns **503 when the `WAITLIST` binding is missing** — never a
redirect to `/thanks/`. A form that accepts an address, thanks the visitor and drops it on the floor
is unrecoverable: the addresses are gone and the page looks like it is working. If signups appear to
be zero, check the binding before concluding nobody is interested.

## Before launch — not optional, and not yet done

- [ ] **Self-host the fonts.** They currently load from Google's CDN. German courts have found that
      embedding Google Fonts transmits a visitor's IP address without consent — a poor look for a
      product whose pitch includes not being careless with your data. `@fontsource-variable/fraunces`
      and `@fontsource-variable/inter` are drop-in.
- [ ] **Replace `/privacy/` with the real policy**, written by counsel. The current page says out
      loud that it is an interim notice covering the waitlist only, which is honest, and it is not a
      privacy policy. **App Store Connect will not accept a binary without a real one** (ROADMAP §4a).
- [ ] **Terms of sale**, before anything can be bought.
- [ ] Add the App Store / Play badges and swap the waitlist for download links.
- [ ] Decide whether `hello@wayleaf.app` exists yet. It is printed on the page twice, and it is the
      only route a person has to ask for their address to be deleted.

## Accessibility and SEO notes

Verified in a real browser at a true 390px viewport (`scrollWidth === clientWidth`, no overflow) and
in both themes. Every colour is a BRAND.md token with a measured ratio; nothing on the page relies
on hue alone.

Two things that are easy to break:

- **`site` in `astro.config.mjs` is load-bearing.** The canonical link, the sitemap and every Open
  Graph URL are absolute and derive from it. Change it and social cards start pointing at localhost.
- **`compressHTML` strips whitespace between a text node and an element across a line break.**
  `…any time.\n<a>What we do with it</a>` rendered as `any time.What we do with it`. Use `{' '}`
  where a sentence continues into a link on the next source line — it is invisible in review and
  obvious to a reader.
