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

Design consequence: the app should feel like a well-set document, not a dashboard.

## 3. Colour

### The principle

**Hue encodes kind. Saturation encodes urgency.**

Colour still carries information rather than decoration, but the two axes do different jobs. *Hue*
tells you what a thing is — a flight, a stay, something to do — and is used at low saturation on
small elements, because knowing the kind is useful at a glance and never urgent. *Saturation* is
reserved for state: a warning, a conflict, an error. That is what keeps a DST warning salient on a
screen where every row already carries a colour.

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
| `--accent` | `#b45309` | `#f0a03c` | The mark, links, primary action |
| `--accent-ink` | `#ffffff` | `#1a1204` | Text on accent |
| `--warn` | `#a8500a` | `#f5b25e` | DST anomalies, stale data |
| `--alert` | `#a4232c` | `#ff8a8a` | Errors, destructive actions |
| `--focus` | `#b45309` | `#f0a03c` | Focus ring |
| `--kind-flight` | `#2c5c8a` | `#7fb3e0` | Flights — hue only, low saturation |
| `--kind-lodging` | `#2f6b4f` | `#7fc9a3` | Stays |
| `--kind-activity` | `#6b4a8a` | `#bda1e0` | Activities |

**Why amber.** It is the colour of a split-flap departure board, which is the right reference for a
timeline of times — apt without being literal. It is also not the default travel-app blue, and
being distinguishable from TripIt at a glance is worth more than being the tenth blue. It is warm
enough to feel human against a document-like layout that could otherwise read as cold.

Amber cannot carry body text at accessible contrast on white, and it is not asked to. It marks,
underlines and fills — never sets paragraphs.

**Two border tokens, deliberately.** `--rule` is decorative: a card is already distinguished from
the page by its surface colour, so its edge is not the sole indicator of anything and does not owe
3:1. `--field` is the border of an input, which *is* the only thing showing where the control
begins and ends, so it meets 3:1 in both themes. Collapsing these into one token forces a choice
between a heavy-looking layout and an input you cannot locate; keeping them apart avoids it.

**Paper is warm, not white.** `#faf9f7` rather than `#ffffff` reduces glare, which matters on a
phone at an airport gate at 6am, and reads as paper rather than screen.

## 4. Type

A document, not a dashboard.

- **Everything in the UI is the system sans.** The first version set headings in a serif, which
  read *editorial* — and an interface that reads like a website is exactly what a consumer expects
  not to find in an app. Familiarity in the interface is worth more than distinctiveness; be
  different in what the product does, not in how its headings are set.
- **The serif survives in one place: the wordmark.** That is enough to carry the identity, and it
  appears once per screen where it cannot be mistaken for body copy.
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

**Card titles step down below 30rem.** A serif at `--text-lg` wraps an ordinary flight name onto
two lines at 390px, which reads as a layout fault rather than a long title; they take `--text-base`
there and the larger step only where there is room. Found by looking at the rendered screen, which
is the only way this kind of thing is ever found.

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

- **Radius:** 14px on cards, 12px on inputs and buttons, 999px on badges and chips. Rounder than
  the first version, which read as severe.
- **No shadows.** Depth comes from a 1px rule and a surface shift. Shadows on a warm paper
  background read as grubby, and they are the first thing to look dated.
- **Cards lift off the page by surface contrast**, not by weight of border. `--surface` sits
  clearly above `--paper`; the rule is a hairline that defines the edge rather than draws it.
- **Every action is filled.** A bordered-transparent button is the mistake the first version made:
  it is quiet to the point of not reading as a control. Primary takes the accent; secondary takes
  `--surface-sunk`; only destructive stays outlined, because a filled red block invites the press
  it exists to discourage.
- **Tappable rows say so** — a chevron at the trailing edge, and a surface shift on hover and
  focus. If a whole card is a link, the user should not have to guess.

## 6a. Navigation

**Primary destinations live in a bottom tab bar**, within thumb reach. This is the single change
that stops a PWA feeling like a website, and it is the convention every consumer app has already
taught people — differing here costs familiarity and buys nothing.

- Three destinations: Trips, Inbox, Account. A tab bar with more than five is a menu wearing a
  disguise.
- The header is a title bar, not a second navigation. Two navigations competing is how a web page
  looks.
- Counts ride the tab icon, as they do everywhere else, and are absent at zero.

## 7. Components

- **Buttons** are 44px minimum in both dimensions, always. Primary is a filled accent; secondary is
  a bordered surface; destructive is text in `--alert` with a border, never a filled red block —
  a filled red button invites the accidental press it should discourage.
- **Cards** are a bordered surface with no shadow. A tappable card gets an accent border on hover
  and focus, not a lift.
- **Inputs** sit inside their label. Hints go in `aria-describedby`, never inside the label — a
  field whose *name* changes as you type is disorienting to anyone navigating by name.
- **Badges** (zone labels, event kinds) are `--surface-sunk` with `--ink-soft` text. They are
  metadata; they never take the accent.
- **The timeline row** is the one component worth getting exactly right: a fixed-width time column
  with tabular figures, a hairline separating days, and the event title at `--text-lg`.

## 8. Voice

Plain, specific, and never cheerful about a problem.

- Say what happened and what to do: *"Offline — showing the copy saved 15 Aug, 16:07."* Not
  *"Oops! Something went wrong."*
- Never apologise for the software's own design. *"Push isn't available on this device"* is a fact,
  not an apology.
- Use the user's words: *flight*, *stay*, *booking*, *reference*. Not *entity*, *record*, *item*.
- No exclamation marks. No emoji in product copy. The mark is the only decoration.

## 9. The logo

An aeronautical chart waypoint: a triangle, which is how a named waypoint is drawn on a navigation
chart. Outlined, with a filled dot at the centroid — the point itself.

It is geometrically simple enough to survive a 16px favicon, has real provenance rather than being
a generic pin, and reads as navigation without depicting an aeroplane. Every travel app has an
aeroplane.

- Minimum size 16px. Below that, the dot alone.
- The triangle is `--accent`; the dot inherits the surface it sits on, so the mark works on paper
  and on ink without a second version.
- Clear space of one triangle-width on all sides.
- Never rotated, never gradient-filled, never given a drop shadow.

## 10. Accessibility is part of the brand, not a checklist

Every token pair in §3 meets 4.5:1 for body text and 3:1 for genuine UI boundaries, in both
themes, and `scripts/check-contrast.py` proves it rather than asserting it — it is a gate that
exits non-zero, not a report.

A palette that has to be exempted to pass is the wrong palette. When the first run of that check
failed on borders, the fix was to split `--rule` from `--field` because the two were doing
different jobs, not to add an exception — and the check now tests each against what it actually
owes.

The `web-accessibility-reviewer` agent checks whether people can *use* a screen. This document
governs whether it looks considered. Both run before anything ships.
