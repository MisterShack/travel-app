# Wayleaf

**Every trip should end with a book.**

A travel memory platform: plan the trip, live it, and keep it. We are not an AI trip planner — we
are a memory company that plans your trip, because planning it is how we get the structured data
that makes the book assemble itself.

> **Status: planning. Nothing is built.** This directory holds the founding documents for a new
> repository. It currently lives inside `mistershack/travel-app` on a branch for review; it is
> intended to be seeded into `mistershack/wayleaf` once the plan is agreed.

## The documents, in reading order

| Document | Owns |
|---|---|
| **BUSINESS-PLAN.md** | Strategy, positioning, pricing, unit economics, go-to-market. David's, v0.3. |
| **ROADMAP.md** | The gates, the order of the work, standing risks, decisions owed. **Start here.** |
| **PLAN.md** | The build: non-negotiables with reasons, the data model, phases with acceptance criteria. |
| **PORTING.md** | What comes across from Waypoint, what comes across changed, and what must not come across. |
| **BRAND.md** | Identity and design system. Measured colour, the mark, voice, accessibility rules. |
| **CLAUDE.md** | The project guide — layout, non-negotiables in short, quality workflow. |

## Relationship to Waypoint

Wayleaf is a **new repository**. Waypoint (`mistershack/travel-app`) is frozen and stays live at
`waypoint.myze.ca` as a personal itinerary app.

Wayleaf borrows its proven parts deliberately — the timezone triple, the auth stack, the email
ingestion pipeline, the trip and membership model — and PORTING.md is the ledger. Nothing is
inherited by accident, and several of Waypoint's best decisions are wrong here. Those are recorded
as inversions rather than quietly dropped:

- **Backups.** Waypoint deferred them by an explicit decision. Here they are a hard requirement from
  the first row, because the worst case stops being "re-enter my own trips" and becomes "lose
  someone's honeymoon".
- **Media storage.** Waypoint put pass bytes inside SQLite, correctly, because Litestream replicates
  the database and nothing else on the disk. With Postgres and R2 that reasoning is void and the
  opposite one applies.
- **Session transport.** Waypoint's cookie sessions and origin guard assume a browser. A React
  Native client is permanently the non-browser case.

## Stack

Postgres on Railway (Drizzle), Cloudflare R2 for all media with zero egress, Hono API, a React SPA
as the companion surface, and React Native (Expo) as the capture surface — iOS first.
