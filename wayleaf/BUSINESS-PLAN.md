# Business Plan — Wayleaf
### Travel memory platform — plan it, live it, keep it

**Version 0.3 — September 2026**
*Revised: name settled (Wayleaf), retroactive-trip entry path added, infrastructure costs corrected downward, app store commission clarified, database and mobile stack decisions added.*
**Status: strategy backbone. Numbers marked ⚠️ are estimates requiring validation before you commit capital.**

---

## 1. The one-sentence thesis

**Every trip should end with a book.**

We are not an AI trip planner. We are a travel memory company that happens to plan your trip — because planning it is how we get the structured data that makes the book assemble itself.

---

## 2. Why not "AI trip planner"

The generation half of this market is saturated and largely free: Layla, Mindtrip, Wanderlog, Stardrift, iPlan, MonkeyTravel, Voyaiger, Anywayr, plus at least four separate apps already named some variant of Waypoint. Layla alone claims north of a million trips planned. Wanderlog and Mindtrip have free tiers.

Competing there means paying to acquire users for a commodity feature against funded incumbents. Do not.

**Three structural facts we can exploit instead:**

1. **The category has a seam down the middle.** Reviewers consistently report the same thing: AI planners generate good starting itineraries but lack what you need during and after the trip — document storage, expense tracking, offline access. Users plan in one app, then manually move the plan to a second app to actually travel with. Nobody owns the whole arc.

2. **Retention is the category killer.** People take 2–3 trips a year. A planner is opened intensively for a week, then dormant for six months. This destroys LTV and is why nobody in this space has a durable consumer business.

3. **Nobody owns the after.** Every competitor goes silent the moment the trip ends — exactly when the user has the strongest emotional attachment and the highest willingness to pay. Polarsteps is closest but doesn't plan. Photo book companies (Shutterfly, Mixbook, Chatbooks, Family Album) don't know anything about your trip.

**Our unfair advantage:** we start from a structured itinerary, not a shapeless camera roll. We know they were at the Colosseum Tuesday 2pm and ate in Trastevere at 8. That means chapters, captions, sequencing, and maps come for free. A photo book company cannot copy this without building a trip planner first. A trip planner cannot copy it without building print fulfilment and earning the right to your camera roll.

---

## 3. Target customer

### Primary: the household memory-keeper

The person in a household who already books the trip, already nags everyone for their photos, and already makes the album. Frequently a mother; **do not build for "women"** — that's a stereotype that will distort your design decisions. Target the behaviour, not the demographic.

Profile:
- 30–50, household with kids or a long-term partner
- 2–4 trips/year, mix of one big trip and short getaways
- Already buys physical prints (this is a proven purchase, not a new behaviour)
- Pain: photos are scattered across 3–5 phones and never get collected
- Willing to pay for a finished object, resistant to paying for software

### Secondary: the collaborators

Everyone else on the trip. They never pay, they never plan — they just dump photos in. **They must never hit a paywall.** They are the growth loop: each trip drags 2–5 new accounts into the product for free, and some fraction of them become the memory-keeper for their own next trip.

### Explicitly not targeting (v1)

- Solo backpackers and digital nomads — high engagement, low print intent
- Business travellers — TripIt owns this, no memory motive
- Group-trip coordination as a headline — Anywayr and MonkeyTravel are there

---

## 4. Product scope

### Two entry paths — build both

**Path A (planned trip):** user plans with us, photos flow in during the trip, book at the end.

**Path B (retroactive trip):** user already took the trip and just wants the book. They create a trip from a date range and destination; we infer the itinerary skeleton from photo EXIF timestamps and geotags rather than from forwarded emails.

Path B is faster to value and likely converts better, because the user arrives already wanting the book. It also unlocks a marketing angle that has nothing to do with trip planning: *turn last summer's photos into a book.* Build it in v1 — it reuses the same clustering machinery.

### v1 — must ship
- Email forwarding ingestion (unique per-user address) → parsed into itinerary
- Timeline view: flights, lodging, transport, reservations, activities
- Trip creation, household invite, shared trip
- Photo upload + auto-attach to the right activity by timestamp and geotag
- Digital trip album (auto-generated, editable)
- Physical book ordering, print-on-demand fulfilment
- Offline access to the itinerary

### v1.5
- In-trip suggestions ("we have two hours, what's near us")
- Preference memory ("we prefer Italian; we like live music; no seafood")
- Calendar write-out (push itinerary into the user's calendar)
- Additional print SKUs (see §9)

### v2+
- Video clips in the digital album
- Expense tracking and splitting
- Booking commissions
- Public/shareable trip pages (SEO surface)

### Deliberately deferred
- Generating itineraries from scratch — this is the commodity. Ingest and organize first; generate later, if ever.
- Native email/inbox integration — see §12, the Google restricted-scope trap.

---

## 5. Where AI actually earns its cost

Ranked by return, not by excitement.

**1. Ingestion and parsing (highest ROI, already built).**
Forwarded confirmations → structured itinerary. Unglamorous, high accuracy requirement, directly enables everything downstream. You already have this working with Gemini. Keep investing here — parse failure is the single most damaging bug in the product.

**2. Book assembly (the actual differentiator).**
This is where the money is and where the hard work is:
- Deduplicate near-identical shots (everyone takes eight of the same cathedral)
- Select the best of each cluster — sharpness, faces, exposure, composition
- Cluster photos to activities by time and location
- Generate captions grounded in the itinerary ("Tuesday — Colosseum"), not generic vision-model output
- Suggest a page layout and chapter break per day or per city
- Detect the cover shot

Get this right and the user's job goes from four hours of layout work to ten minutes of approval. That's the product.

**3. Preference memory (cross-cutting).**
Explicit and correctable, not inferred from photos. Note that the App Store Waypoint already claims photo-inferred taste learning — differentiate by making it a visible, editable profile the user controls. Persist across trips.

**4. In-trip suggestions (commoditized).**
Necessary for credibility, not a moat. Use a cheap model plus a places API. Do not over-invest.

---

## 6. Platform strategy

**Mobile-first, non-negotiable.** Photos originate on the phone. In-trip use is on the phone. Camera roll permission is the whole game. Push notifications ("you're near three places you saved") only exist on mobile.

**iOS first.** Higher print-purchase propensity, better photo APIs, faster to ship one platform well. Android within 6 months — several competitors are iOS-only and it's a noted gap.

**Web as companion, not afterthought.** Two jobs web does better:
1. Book layout editing — genuinely better on a large screen
2. Pre-trip planning at a desk

Web should be read-and-edit, never the primary capture surface.

### Build approach: React Native (Expo), not Capacitor, not native Swift

**Rule out native Swift + Kotlin.** Two codebases is the wrong call for a two-person team. You'd ship half as fast for polish nobody would notice in a photo app.

**Rule out Capacitor.** Capacitor is excellent when the app is mostly forms, lists and text. It falls down on exactly your core interaction: bulk photo handling. In a webview you get memory pressure rendering hundreds of camera-roll thumbnails, no true background upload (uploads die when the app is backgrounded — fatal when someone dumps 400 photos over hotel wifi), slow scrolling on large grids, and awkward access to native photo pickers. The one thing your app must do flawlessly is the one thing a webview does worst.

**Use React Native with Expo.** One codebase for iOS and Android, first-class camera roll and background upload libraries, TypeScript shared with the web app, and it can talk directly to R2 with presigned URLs. Well-represented in training data, so it works well with Claude Code.

**Web app stays separate** — a normal React SPA sharing types and API client with the mobile app. Don't try to make one codebase serve both surfaces; the jobs are genuinely different.

### Database: Postgres on Railway

SQLite (current setup) should be replaced before launch, while migration is still cheap:
- Household photo pooling means concurrent writers; SQLite serializes writes
- Railway's filesystem is ephemeral, so SQLite requires a persistent volume, which pins you to a single instance forever and leaves backups manual

**Railway Postgres over Supabase**, because auth is already built. Supabase's value is its bundle (auth, storage, realtime) and you'd be using none of it — R2 handles storage, you handle auth. One platform, one bill, no cross-network hop.

**Portability is the real hedge** against either vendor changing pricing (both can):
- Plain SQL or a portable ORM (Drizzle, Prisma) — never a vendor SDK
- No vendor-specific extensions
- Your own nightly `pg_dump` to R2, independent of the platform's backups
- Connection string in config

Do this and a migration is a weekend, not a rewrite.

**Backups are a hard requirement, not a nice-to-have.** This data is irreplaceable — losing a database here means losing someone's honeymoon. Verify Railway's current automated backup and point-in-time-recovery offering before committing; Supabase has historically been stronger here. If Railway's PITR is thin, build the dump-to-R2 pipeline yourself. **Test the restore, not just the backup.**

---

## 7. Pricing — three models evaluated

### Model A: free planning, à la carte book
Everything free; you pay only when you order.
- ✅ Maximum funnel, zero friction, collaborators join freely
- ✅ Purchase happens at peak emotion (right after the trip)
- ❌ No recurring revenue, brutal seasonality, non-buyers cost you money

### Model B: buy a "trip" (planning + book included)
Prepaid pack: one trip, X users, Y photos, one book included.
- ✅ Revenue upfront, clean mental model, breakage on unredeemed books
- ❌ Paywall before value is proven — fatal for a product whose value is only obvious at the end
- ❌ Kills the collaborator loop, which is your cheapest acquisition channel
- ❌ Asks for the purchase decision at the moment of lowest emotional attachment

### Model C: subscription
- ✅ Predictable, fundable
- ❌ 2–3 trips/year makes a subscription feel like paying for nothing 10 months a year — this is exactly why the category churns

### Recommended: A as the spine, C as an optional upgrade

| Tier | Price ⚠️ | Contents |
|---|---|---|
| **Free** | $0 | Unlimited trips, itinerary, email forwarding, photo pooling, digital album, offline. Collaborators always free. |
| **Household** | $39/yr | Full-resolution originals retained indefinitely, in-trip AI suggestions, preference memory, one book credit/year (worth ~$60), 20% off additional prints |
| **Books & prints** | $45–$89 | Sold à la carte to everyone |

Rationale: free tier maximises the pool of trips containing photos. The book is the conversion event and happens when the user *wants* to spend. The subscription exists mostly to bundle a book at a discount for repeat travellers — it converts a one-off transaction into an annual one.

**App store commission — better news than expected.** Physical goods and real-world services have never required Apple's In-App Purchase, anywhere in the world. **Books, prints and magnets go through Stripe at 0% Apple commission** — the bulk of your revenue is untouched. Only the $39/yr Household subscription is a digital good and would owe 15% under the Small Business Program (under $1M revenue). US external-link rules are currently favourable but genuinely unsettled — the courts vacated the total commission ban and remanded for a permissible rate to be set. **Assume 15% on subscriptions; treat anything better as upside.**

Fixed platform costs: Apple $99/year (charged regardless of monetization), Google Play $25 one-time.

**Storage as the honest gate.** Rather than capping photos (feels punitive and hurts book quality), free tier keeps display-resolution copies indefinitely and print-resolution originals for 12 months. Household keeps originals forever. This is real cost, it's easy to explain, and it creates a genuine reason to subscribe.

---

## 8. Unit economics

### Photo book (the core transaction)

All ⚠️ — you must open a Prodigi account and pull real rate cards before trusting any of this. Prodigi absorbed Peecho and now handles hardcover, softcover and layflat via print API with global dropshipping and no minimums.

Assume 8×8" hardcover, ~40 pages:

| Line | Amount |
|---|---|
| Retail price | $59.00 |
| Print cost ⚠️ | –$19.00 |
| Shipping ⚠️ | –$8.00 |
| Payment processing (2.9% + $0.30) | –$2.01 |
| AI compute for book assembly ⚠️ | –$0.60 |
| Storage attributable | –$0.15 |
| Reprints/damages reserve (4%) | –$2.36 |
| **Contribution margin** | **$26.88 (46%)** |

Sanity checks:
- Consumer photo books retail $30–$70; $59 sits mid-market and is defensible given the work we remove
- Peecho reported a repurchase rate near 60% on photo books — if that holds even directionally, LTV is materially better than a one-shot transaction
- **Free shipping above $75** pushes basket size and hides the shipping line

### Blended per-user economics ⚠️

| | Free user | Household |
|---|---|---|
| Annual revenue | $0 | $39 |
| Book attach rate | 8% | 85% |
| Book contribution | $2.15 | $22.85 (discounted) |
| Annual cost to serve | –$1.80 | –$4.50 |
| **Contribution/user/yr** | **$0.35** | **$57.35** |

Free users are roughly break-even and function as the acquisition engine. The business lives or dies on **book attach rate**. That is the single metric to instrument first.

### Cost to serve, derived

**Storage.** Cloudflare R2 is the clear choice: $0.015/GB-month standard, $0.01/GB-month infrequent access, and **zero egress at any volume**, versus $0.09/GB egress on S3. For a photo-serving app that difference is the whole bill. Note reads still bill as Class B operations ($0.36/million) — the cost moves to operations, not gigabytes.

- Average trip: ~400 photos × 4MB ≈ 1.6 GB of originals
- 3 trips/year ≈ 5 GB/user/year ≈ **$0.90/user/year** standard
- Tier originals older than 12 months to Infrequent Access → ~$0.60
- Serve display-resolution derivatives (~400KB), never originals, to keep read costs down

**Video is the cost bomb.** One minute of 4K is roughly 350MB — a single clip can exceed an entire trip's photos. Recommendation: allow short clips in the digital album only, cap at 30 seconds and 20 clips per trip, transcode aggressively on upload, never in v1.

**AI.** Parsing is cheap. Book assembly is the expensive call and only fires when a user actually builds a book — cost lands on a revenue event, which is exactly where you want it.

**Fixed costs (2 founders, no salaries) — corrected:** the earlier $300–600/month estimate was wrong by roughly 5–10×. With the optimized architecture (Railway for app/API/Postgres, R2 for all media), closed beta runs **~$40/month**: Railway Hobby $5–25, R2 ~$4 for 240 GB, zero egress, Cloudflare Images free under 5,000 transforms/month, AI $2–10, Resend and Sentry on free tiers. Add $99/yr Apple and $25 one-time Google.

$300–600/month is a mid-growth number (~1,000 MAU), and only if you route media through Railway rather than R2. See the separate infrastructure cost model for the full breakdown at 150 / 1,000 / 10,000 users.

### Break-even ⚠️
At ~$27 contribution per book, ~25 books/month covers a $600 infra bill. Meaningful founder income needs roughly 200–400 books/month. That's the number to aim the whole plan at.

---

## 9. Beyond books

Sequence matters — don't fragment before the core works.

**Phase 1 (with book launch)**
- Single prints and print sets — trivial to add via the same API, tiny AOV lift
- Digital album share link — free, viral, drives signups

**Phase 2**
- **Fridge magnets** — cheap, high margin, excellent impulse add-on at checkout, and a permanently visible reminder of the brand in the kitchen
- Postcard packs from trip photos
- Softcover "mini book" at ~$25 as the low-price entry point

**Phase 3, only if data supports it**
- Wall art / framed prints (higher AOV, higher damage rate)
- Annual "year in travel" book — an excellent December subscription hook

**Skip:** shirts and apparel. Sizing, returns, and the fact that nobody wants their holiday snap on a t-shirt.

**Christmas is not optional.** Photo book demand spikes hard in November–December for gifting. Ship the ordering flow no later than **early October** to catch a season, or you wait a full year.

---

## 10. Go-to-market

**Do not fight for "best AI trip planner."** That SERP is owned by funded competitors and affiliate blogs, several of which publish comparison content specifically to rank.

**Channels, in priority order:**

1. **The book is the marketing.** A physical object in someone's living room with a discreet logo on the back cover. Include two referral cards in every shipment. This is the highest-intent channel you will ever have and it costs cents.

2. **The collaborator loop.** Every shared trip pulls 2–5 people into the app for free. Instrument this. Optimise the invite flow above almost everything else. Post-trip, prompt every collaborator — not just the owner — with a preview of the finished album.

3. **Content aimed at the memory-keeper, not the traveller.** Pinterest and Instagram, "travel photo book," "vacation scrapbook," "how to organize trip photos." Far less contested than trip planning, and closer to purchase intent.

4. **Seasonal push.** Post-summer (September, freshly returned) and pre-Christmas (gifting). Concentrate spend here.

5. **Family/parenting communities.** You have direct experience with Family Album for your daughter's prints — that adjacency is real. The same person buys both.

6. **The retroactive angle.** "Turn last summer's photos into a book" acquires people who have never heard of a trip planner and don't want one. Lowest-friction path to a first purchase, and it works year-round rather than only in season.

**Launch motion:** waitlist → 50 hand-held beta households → get real books into real hands → photograph the results → those photos become the entire marketing site.

**The metric that matters:** book attach rate per completed trip. Everything else is vanity.

---

## 11. Branding

### Name — settled: **Wayleaf**

Cleared on CIPO and both app stores. `wayleaf.app` secured.

Why it works:
- "Leaf" is a genuine bookbinding term for a page, so the book reference is earned rather than decorative
- "Way" retains the travel sense without describing a map primitive, which was Waypoint's problem
- One pronunciation, one spelling — passes the radio test
- Strong mark available: a leaf that reads as a turning page is flat, distinctive at 20px, and nothing like a map pin
- Doesn't box us into travel if we later expand to other structured occasions (§4)

**Rejected: Waypoint.** At least four active travel apps use it, several doing near-identical work; HashiCorp has a dev product by the same name; good domains gone; real trademark exposure; and it describes a map primitive, which is the old positioning.

**Trademark timing — do not defer to "when we have traffic."** That heuristic is for pure software. We print the name on the spine of a physical object shipped to customers, and a forced rename after a production run is an order of magnitude more expensive than after a soft launch. **File the CIPO application before the first production print run.** A few hundred dollars in government fees per class. Relevant classes: 9 (software), 16 (printed matter), 40 (printing services).

**Domain.** `wayleaf.app` is a legitimate long-term home for a mobile-first product, not a placeholder. Pursue `.com` opportunistically via a broker if it's held by a dormant registrant, with a walk-away number set in advance. Grab `wayleaf.ca` defensively and redirect it.

### Tagline

Current: *"Don't leave the trip behind. Leaf through it."*

Recommendation: **test the second half alone.** "Leaf through it" carries the pun and the product. The first clause is weaker, and *leave/leaf* in close proximity muddies the wordplay rather than setting it up.

### Colour

Two rules for a photo product:

1. **The UI must be neutral.** Photos supply the colour. Any saturated brand colour in the chrome fights the content and makes everyone's holiday snaps look worse.
2. **Get away from AI blue/purple and map-app green.** Both are category tells.

Proposed palette:
- **Base:** warm off-white / paper cream (`#FAF7F2`) and deep ink (`#1C1B19`)
- **Accent:** a single warm one — terracotta (`#C4633F`) or deep amber. Used sparingly: primary buttons, active states, the book spine.
- **Support:** warm greys only. No cool greys — they read clinical next to photographs.

The whole thing should feel like good stationery and archival paper, not a SaaS dashboard.

### Logo

The mark should live at the intersection of *journey* and *book*, and Wayleaf hands us a strong one directly: **a leaf that also reads as a turning page.** Both are flat, organic, single-shape forms; the fold line does the work.

Alternative directions if that proves too literal:
- A spine or fold that also reads as a path
- Stacked layers suggesting both pages and days
- The aviation-diamond waypoint glyph is still strong if you keep the name-adjacent concept, and it holds up at 20px

Requirements regardless of direction: flat vector, single colour, interior detail as negative space (never drawn lines), legible at 20px, no glow, no gradient. Set the wordmark in a real typeface — never let an image generator produce lettering.

---

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Google restricted-scope trap** | High | Gmail read access requires restricted-scope verification and a third-party security assessment that has historically cost tens of thousands. **Stay on forwarding addresses.** You already have this. Do not "upgrade" to inbox integration without pricing the audit. |
| Book attach rate lands below 5% | Existential | Instrument from day one. If free users don't convert, flip to Model B faster. |
| Print quality complaints | High | Order samples from three vendors before choosing. Print quality is the product. |
| Seasonality | Medium | Annual "year in travel" book, plus Christmas gifting push |
| Print partner dependency | Medium | Abstract the fulfilment layer behind an interface from day one; keep a second vendor integrated |
| Camera roll permission refusal | Medium | Make manual upload genuinely pleasant; don't gate the app behind full-library access |
| Photo geotag privacy | Medium | Strip EXIF on shared links by default; be explicit about it — it's a trust feature |
| Incumbent copies the book | Low–Medium | Wanderlog or Mindtrip could bolt on printing. Your defence is speed and the fact that print fulfilment is unglamorous work incumbents avoid. |

---

## 13. Milestones

| Phase | Target | Exit criteria |
|---|---|---|
| **0. Foundation** | Now → Oct 2026 | Name locked ✅, `wayleaf.ca` secured, Prodigi account open with real rate cards, print samples in hand, Postgres migration done, R2 wired up |
| **1. Closed beta** | Oct → Dec 2026 | 50 households, complete trip→book flow working end to end, ≥20 books actually shipped |
| **2. Public launch** | Q1 2027 | iOS live, book attach rate measured, unit economics confirmed against real invoices |
| **3. Scale** | 2027 | Android, magnets and prints, 200+ books/month |

---

## 14. Immediate next actions

1. Open a Prodigi account and pull real photo book rate cards — **every number in §8 is a guess until you do this**
2. Order sample books from Prodigi and one competitor; judge them side by side
3. ~~Clear a name~~ **Done: Wayleaf, cleared CIPO and both stores, `wayleaf.app` secured.** Remaining: grab `wayleaf.ca`, and file the CIPO trademark before the first production print run
4. Migrate SQLite → Railway Postgres while it's still cheap; set up `pg_dump` to R2 and **test a restore**
5. Move media to Cloudflare R2 with presigned direct uploads
6. Build the smallest possible end-to-end path: forwarded email → itinerary → photos → generated PDF → real printed book in your hands
7. Instrument book attach rate before you instrument anything else

---

*⚠️ Every financial figure in this document is an estimate constructed from public pricing and category norms. Validate against real vendor quotes before making commitments.*
