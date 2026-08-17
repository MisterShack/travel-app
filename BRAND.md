# Waypoint — brand and design system

> The source of truth for how this app looks and sounds. Screens are reviewed against this
> document, not against taste. If a rule here is wrong, change it here first.

## 1. The name

**Waypoint.** A point on a route with a time attached — which is exactly what a row in this app is.

It was chosen over mood words (*Wander*, *Voyage*, *Roam*) because it describes the data model
rather than a feeling, and names that describe structure age better than names that describe a
vibe. It is also a plain noun, which makes it a sibling to **Ledger**, the other app in this
family, rather than a stranger.

- Written **Waypoint**, never *WayPoint* or *waypoint* mid-sentence.
- No tagline in the UI. A product that needs a tagline on its own home screen has not explained
  itself.

## 2. What it is competing against, and on what

TripIt, Wanderlog and the rest are online-first, ad-supported or upsell-driven, and casual about
timezones. Waypoint is none of those things. The three claims worth designing around:

1. **It works when you are actually travelling** — the timeline reads with no network.
2. **The times are right** — every event carries its own zone, and the app never guesses.
3. **It is quiet.** No upsells, no recommendations you did not ask for, no badge counts.

Design consequence: the app should feel like a **well-built app that happens to be quiet** — not
like a document, and not like a list of tasks. The first version overcorrected into "well-set
document" and arrived at something that read as an enhanced to-do list: flat sections, bare links,
glyphs standing in for icons. Quiet is about *what the app asks of you*, not about how little it is
willing to render.

## 3. Colour

### The principle

**Hue encodes kind. Saturation encodes urgency.**

Colour still carries information rather than decoration, but the two axes do different jobs. *Hue*
tells you what a thing is — a flight, a stay, something to do. *Saturation* is reserved for state:
a warning, a conflict, an error. That is what keeps a DST warning salient on a screen where every
row already carries a colour.

The failure this avoids is the common one: colouring everything brightly, so nothing can say "look
here" when it needs to. The failure it also avoids is the opposite one, which the first version of
this system fell into — so little colour that the interface reads as a document and nothing looks
interactive.

This is deliberately the inverse of the McDonald's logic. Red and yellow are chosen to arouse and
attract at distance; the person using Waypoint is already stressed, often late, and does not need
activating. The job is to lower cognitive load, not raise attention.

The evidence base for colour *association* is weaker and more culturally contingent than the
popular version suggests, so the palette does not lean on it. What is well-supported and is leaned
on: warm saturated colour is arousing and cool desaturated colour is calming; contrast governs
legibility far more than hue does; and consistent use is what makes a colour recognisable — owning
one matters more than which one it is.

### The palette

Ink on warm paper, with a single amber accent.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#16181d` | `#eceef2` | Body text, headings |
| `--ink-soft` | `#5a6473` | `#98a2b3` | Secondary text, labels |
| `--paper` | `#faf9f7` | `#101216` | Page background |
| `--surface` | `#ffffff` | `#191c22` | Cards |
| `--surface-sunk` | `#f1efec` | `#22262e` | Inset areas, badges |
| `--rule` | `#dcd8d2` | `#2c313a` | Decorative dividers and card edges |
| `--field` | `#8f887c` | `#6b7280` | Input borders — the only thing showing where a control is |
| `--accent` | `#b45309` | `#f0a03c` | Links, primary action, the wordmark |
| `--accent-ink` | `#ffffff` | `#1a1204` | Text on accent |
| `--accent-wash` | `#fdf3e8` | `#241a0c` | Tinted surface: the trip header, the active tab |
| `--accent-line` | `#e8c9a6` | `#4a3517` | Edge of a tinted surface |
| `--warn` | `#a8500a` | `#f5b25e` | DST anomalies, stale data |
| `--alert` | `#a4232c` | `#ff8a8a` | Errors, destructive actions |
| `--focus` | `#b45309` | `#f0a03c` | Focus ring |
| `--kind-segment` | `#2c5c8a` | `#7fb3e0` | Journeys — flight, train, coach, ferry |
| `--kind-lodging` | `#2f6b4f` | `#7fc9a3` | Stays |
| `--kind-activity` | `#6b4a8a` | `#bda1e0` | Activities |

**Why amber.** Two reasons, and the second is the stronger one.

It is the colour of a split-flap departure board, which is the right reference for a timeline of
times — apt without being literal. And it is the colour the travel category already uses for
*movement*: Kayak, Budget, easyJet, Bolt. That is not a claim about what orange does to a brain; it
is a claim about what people have already been taught, which is the only reliable kind of colour
association there is. It is also not the default travel-app blue, and being distinguishable from
TripIt at a glance is worth more than being the tenth blue.

Amber cannot carry body text at accessible contrast on white, and it is not asked to. It marks,
underlines, washes and fills — never sets paragraphs.

**Amber gets a wash, not just a text colour.** `--accent-wash` and `--accent-line` exist so the
accent can appear as a *surface* — the trip header, the active tab, the selected state. Without
them the accent could only ever be a word or a border, and an interface where the brand colour
never covers area reads as unfinished. The wash is pale enough that `--ink`, `--ink-soft` and
`--accent` all still meet 4.5:1 on it, which on warm paper leaves it only ~1.04:1 away from the page
itself — so **a wash is always drawn with an `--accent-line` edge**. That is the whole job of the
second token: the tint carries the warmth, the hairline carries the boundary. A wash dark enough to
define its own edge could not have carried accent text, and text won.

**Two border tokens, deliberately.** `--rule` is decorative: a card is already distinguished from
the page by its surface colour, so its edge is not the sole indicator of anything and does not owe
3:1. `--field` is the border of an input, which *is* the only thing showing where the control
begins and ends, so it meets 3:1 in both themes. Collapsing these into one token forces a choice
between a heavy-looking layout and an input you cannot locate; keeping them apart avoids it.

**Paper is warm, not white.** `#faf9f7` rather than `#ffffff` reduces glare, which matters on a
phone at an airport gate at 6am, and reads as paper rather than screen.

## 4. Type

- **Everything in the UI is the system sans.** An early version set headings in a serif, which read
  *editorial* — and an interface that reads like a website is exactly what a consumer expects not
  to find in an app. Familiarity in the interface is worth more than distinctiveness; be different
  in what the product does, not in how the headings are set.
- **The serif survives in one place: the wordmark** — and now carries the identity alone (§9). It
  is set in `--serif` at 600 with `-0.02em` tracking, and it is the only serif on any screen.
- **Body and UI:** the system sans stack. It is already on the device, renders natively, and adds
  no weight to a bundle that must work with no network.
- **Times:** tabular figures, always. A column of times that shifts by a pixel per digit looks
  broken, and this app is mostly a column of times.

### Scale

A 1.25 ratio from a 16px base. Nothing between the steps.

| Token | Size / line | Use |
|---|---|---|
| `--text-xs` | 12 / 16 | Metadata, badges |
| `--text-sm` | 14 / 20 | Secondary, labels |
| `--text-base` | 16 / 24 | Body, inputs |
| `--text-lg` | 20 / 28 | Section headings; card titles at ≥30rem |
| `--text-xl` | 25 / 32 | Reserved |
| `--text-2xl` | 31 / 38 | The screen title — one per screen |

**The screen title outranks section headings.** It takes `--text-2xl` and sections take
`--text-lg`; at one step apart the trip name and "People" competed and the page had no focal point.

Never below 16px for anything a user types into — iOS zooms the viewport on focus for smaller
inputs, which feels like a bug.

## 5. Space

A 4px base, used in multiples of 4. `--space-1` through `--space-10` (4px…64px).

Vertical rhythm matters more than horizontal here: the timeline is a long column, and consistent
gaps between day groups, cards and rows are what make it scannable. Horizontal padding stays
constant at every breakpoint so the text column never shifts under the reader.

## 6. Shape and depth

- **Radius:** 14px on cards, 12px on inputs and buttons, 999px on badges and chips.
- **No shadows, with one exception.** Depth comes from a 1px rule and a surface shift; shadows on
  warm paper read as grubby and date fastest. The exception is a layer that genuinely floats above
  the page and must be read as temporary — the action sheet (§6b) and nothing else.
- **Cards lift off the page by surface contrast**, not by weight of border.
- **Every action is filled.** A bordered-transparent button is quiet to the point of not reading as
  a control. Primary takes the accent; secondary takes `--surface-sunk`; only destructive stays
  outlined, because a filled red block invites the press it exists to discourage. **A bare
  underlined link is never an action.** A secondary route out of a form — *Cancel*, *Create an
  account*, *Forgot password* — is a button, sitting next to the primary one. Bare links in an
  action row were the single clearest tell that this was a web page with a form on it.
- **Tappable rows say so** — a chevron at the trailing edge, and a surface shift on hover and
  focus.

## 6a. Navigation

**Primary destinations live in a bottom tab bar**, within thumb reach. This is the single change
that stops a PWA feeling like a website, and it is the convention every consumer app has already
taught people — differing here costs familiarity and buys nothing.

- Three destinations: Trips, Inbox, Account. A tab bar with more than five is a menu wearing a
  disguise.
- The active tab takes the accent **and** an `--accent-wash` pill behind its icon. Colour alone is
  not enough of a difference to find at a glance on a moving bus.
- The header is a title bar, not a second navigation. Two navigations competing is how a web page
  looks.
- Counts ride the tab icon, as they do everywhere else, and are absent at zero.

## 6b. Screen anatomy

The rule that fixes the "enhanced to-do list" feel: **a screen has one job, and the things that
administer it live behind a control rather than below the fold.**

- **Every screen opens with a header block, not a bare `<h2>`.** On a trip that is the trip header:
  name, destination, dates, and a *live* status — `In 12 days`, `Day 3 of 8`, `Ended`. The status
  is computed, not decorative; it is the one thing a traveller wants before anything else.
- **Content, then nothing else.** The trip screen is the timeline. People, notification settings
  and deletion moved to `/trips/:id/settings`, reached from **Manage** in the header. A page that
  ends in a delete button is a settings page pretending to be a view.
- **Creation is one primary action, not a row of them.** Three side-by-side *+ Flight / + Stay /
  + Activity* buttons made the user choose a type before they had decided to add anything. One
  **Add to trip** button opens an action sheet with the three kinds, each carrying its hue.
- **The action sheet** slides from the bottom, is dismissed by backdrop, `Esc` or Cancel, traps
  focus while open, and restores focus to the button that opened it. It is the only floating layer
  in the app.
- **Loading is a skeleton, not the word "Loading…".** Skeletons hold the shape of what is coming,
  so the page does not jump when it arrives — and text that says "Loading…" is the most website
  thing an app can do.
- **Signed-out screens are a centred card** under the wordmark, at a narrower measure than the app.
  A sign-in form running the full width of a desktop window is a form on a web page.

## 7. Components

- **Buttons** are 44px minimum in both dimensions, always.
- **Cards** are a bordered surface with no shadow. A tappable card gets an accent border on hover
  and focus, not a lift.
- **Inputs** sit inside their label. Hints go in `aria-describedby`, never inside the label — a
  field whose *name* changes as you type is disorienting to anyone navigating by name.
- **Badges** (zone labels, event kinds) are `--surface-sunk` with `--ink-soft` text. They are
  metadata; they never take the accent.
- **The timeline row** is the one component worth getting exactly right: a fixed-width time column
  with tabular figures, a hairline separating days, and a **round kind chip** — the kind's hue at
  12% on a tinted disc, holding a stroked icon. **Hue is the kind, shape is the mode**: every
  journey takes one blue, and a train is told from a flight by its icon. Four hues for four modes
  would spend the palette on a distinction the icon already makes. It replaced a bare text glyph (`✈ ⌂ ◆`), which was
  the other clearest tell of a to-do list: a character where an icon should be.

## 8. Voice

Plain, specific, and never cheerful about a problem.

- Say what happened and what to do: *"Offline — showing the copy saved 15 Aug, 16:07."* Not
  *"Oops! Something went wrong."*
- Never apologise for the software's own design. *"Push isn't available on this device"* is a fact,
  not an apology.
- Use the user's words: *flight*, *stay*, *booking*, *reference*. Not *entity*, *record*, *item*.
- No exclamation marks. No emoji in product copy.

## 9. The mark — and why there is not one

**Waypoint has no pictorial mark. The identity is the wordmark**, set in `--serif` in `--accent`.

There was one: an outlined triangle with a filled dot at the centroid, which is how a named waypoint
is drawn on an aeronautical chart. It had real provenance and it was not an aeroplane. It was also,
at a glance, **a hazard sign** — an amber outlined triangle with something in the middle is the
single most over-learned warning shape there is, and no amount of provenance survives the 200ms a
person actually spends on an app icon. It was removed on 2026-08-16 after David read it as a
warning symbol on his own home screen.

The lesson worth keeping is the general one: *a mark means what people already read it as, not what
it is derived from.* Checking a mark against its own rationale cannot catch this; only showing it to
someone can.

Until a mark earns its place, the rules are:

- **The wordmark stands alone.** No lockup, no icon beside it. It appears once per screen.
- **The app icon is a `W`** — a geometric zigzag in `--accent` on `--paper` (dark), drawn as a
  stroked polyline in `scripts/build-icons.py`. It is a letter, not a symbol, so it cannot be
  misread as one. It is a placeholder with a clear conscience, not a design.
- **Nothing gets adopted as a mark without being seen small, on a home screen, by someone who was
  not told what it is meant to be.** That test is now the bar.

## 10. Accessibility is part of the brand, not a checklist

Every token pair in §3 meets 4.5:1 for body text and 3:1 for genuine UI boundaries, in both
themes, and `scripts/check-contrast.py` proves it rather than asserting it — it is a gate that
exits non-zero, not a report.

A palette that has to be exempted to pass is the wrong palette. When the first run of that check
failed on borders, the fix was to split `--rule` from `--field` because the two were doing
different jobs, not to add an exception.

The `web-accessibility-reviewer` agent checks whether people can *use* a screen. This document
governs whether it looks considered. Both run before anything ships.
