# Wayleaf — brand and design system

> BUSINESS-PLAN §11 settles the name, the tagline direction and the colour *principle*. This
> document turns that into tokens with measured numbers against them, and owns the rules the UI is
> held to.
>
> Written 2026-09-03. Every contrast ratio below was computed, not estimated; §7 says how to
> re-derive them.

## 1. The name

**Wayleaf.** Cleared on CIPO and both app stores; `wayleaf.app` secured.

"Leaf" is a bookbinding term for a page, so the book reference is earned rather than decorative.
"Way" keeps the travel sense without naming a map primitive — which was Waypoint's problem, along
with at least four active travel apps and a HashiCorp dev product using it.

One pronunciation, one spelling. It passes the radio test.

**Trademark is not deferred to "when we have traffic."** That heuristic is for pure software. The
name goes on the spine of a physical object shipped to a customer, and a forced rename after a
production run costs an order of magnitude more than one after a soft launch. **File the CIPO
application before the first production print run** — classes 9 (software), 16 (printed matter),
40 (printing services).

## 2. Tagline

Current: *"Don't leave the trip behind. Leaf through it."*

**Recommendation: ship the second half alone — "Leaf through it."** It carries both the pun and the
product. The first clause is weaker, and *leave/leaf* in close proximity muddies the wordplay
rather than setting it up: the reader resolves the near-homophone once, in the wrong direction, and
the actual joke arrives spent.

Keep the full version as a subhead where there is room for a beat before it.

## 3. Colour

### The principle, which overrides every preference below

**The UI is neutral. The photos supply the colour.** Any saturated chrome fights the content and
makes everyone's holiday snaps look worse — a photo product's interface is a mount board, and mount
board is not a feature.

Two category tells to stay away from: **AI blue/purple**, and **map-app green**. Both announce what
we have spent §2 of the business plan arguing we are not.

**Warm greys only.** Cool greys read clinical beside photographs, and beside skin especially.

### The correction: the proposed accent fails contrast as text

BUSINESS-PLAN §11 proposes terracotta **`#C4633F`** on paper cream **`#FAF7F2`**. Measured, that is
**3.78:1**. It fails WCAG AA for normal text (4.5:1), and — because contrast is symmetric — a
primary button filled `#C4633F` with a paper-cream label fails at exactly the same 3.78:1. It clears
3:1, so it is legal for large text and for UI component boundaries, and nothing else.

That is not a usable accent for a product whose accent's stated job is "primary buttons, active
states, the book spine." Two of those three are text on a fill.

**So the accent darkens to `#A8482A` — 5.42:1 on paper, and 5.42:1 the other way as a filled
button.** Same hue family, same warmth, same terracotta reading; it is the *lightness* that had to
move, not the character. `#C4633F` survives as a decorative wash and a large-format fill only, and
is never allowed to carry text.

This is a specific instance of a general trap worth stating: **a colour chosen for how it feels
against a background is not thereby a colour that can carry text on it.** Waypoint shipped a
selected-state token that measured 1.00:1 against its own surface in dark mode — identical relative
luminance — because it had been tuned to carry *ink* at 4.5:1, which is a different job.

### The palette

**Light — the default.** The product should read as paper.

| Token | Value | Job |
|---|---|---|
| `--ground` | `#FAF7F2` | Page. Paper cream. |
| `--surface` | `#FFFDFA` | Cards, sheets — a shade *above* the page, not below. |
| `--surface-sunk` | `#F1ECE4` | Wells, inputs, the photo grid behind thumbnails. |
| `--ink` | `#1C1B19` | Body text. **16.11:1** on ground. |
| `--ink-muted` | `#57534E` | Secondary text, captions, metadata. **7.14:1** on ground, 6.49:1 on sunk. |
| `--accent` | `#A8482A` | Links, primary fills, active states, the spine. **5.42:1** on ground, 5.70:1 on surface. |
| `--accent-wash` | `#C4633F` | Decoration and large fills only. **Never text.** |
| `--hairline` | `#D9D1C6` | Decorative separation only — 1.42:1, and that is fine, because the surface layers carry the structure. |
| `--edge` | `#8C837A` | The boundary of a control where the boundary is the *only* thing indicating it. **3.48:1**. |

**Dark.** Not an inversion — a darkroom. Warm, and never black.

| Token | Value | Job |
|---|---|---|
| `--ground` | `#1A1917` | Page. |
| `--surface` | `#232120` | Cards — *above* the page here too. |
| `--surface-sunk` | `#131211` | Wells. |
| `--ink` | `#F2EDE6` | **15.08:1** on ground, 13.77:1 on surface. |
| `--ink-muted` | `#A9A29A` | **6.96:1** on ground, 6.35:1 on surface. |
| `--accent` | `#D4805C` | **5.89:1** on ground, 5.38:1 on surface; ground-on-accent as a fill is 5.89:1. |
| `--edge` | `#706A62` | **3.29:1**. |

**Dark mode is not optional for this product**, and the reason is specific rather than fashionable:
people look at their photos in bed, and a full-screen `#FAF7F2` at 23:00 is hostile. It also
happens to be the correct mount for an image — a photograph on a dark ground reads with more
contrast and less flare than the same photograph on white.

### Photos are exempt from the palette

Never tint, overlay, duotone or brand-filter a user's photograph. Not on a card, not on a cover
preview, not on a share image. A gradient scrim behind text laid over a photo is allowed and should
be neutral black at low alpha — never accent-coloured.

## 4. Type

Set the wordmark in a real typeface. **Never let an image generator produce lettering** — it
produces shapes that resemble letters, which is a different thing, and it is obvious at 200%.

The interface wants a text face that does not perform. A photo book's own pages may want a
different, more bookish face than the app chrome; that is a decision for Phase 2, when there are
real pages to look at, and it should be made by printing them rather than by looking at a screen.

## 5. The mark

**A leaf that also reads as a turning page.** The name hands this over directly: both are flat,
organic, single-shape forms, and the fold line does all the work.

Requirements, whichever direction wins:

- Flat vector, single colour.
- **Interior detail as negative space, never drawn lines.** Lines close up at small sizes.
- Legible at **20px**. Test it there first, not last.
- No glow, no gradient, no bevel.

Alternatives if the leaf proves too literal: a spine or fold that also reads as a path; stacked
layers suggesting both pages and days.

**And the rule Waypoint paid for:** a mark means what people already read it as, not what it is
derived from. Waypoint's amber outlined triangle with a centred dot is exactly how an aeronautical
chart draws a named waypoint — and on a phone home screen it read as a hazard sign, to its own
author. **Put the candidate on a real home screen among real icons before committing to it**, and
show it to someone who has not been told what it means.

## 6. Voice

Plain, warm, specific. We are handling something the user cannot replace, and the register that
suits that is a good archivist's: calm, concrete, never cute about the stakes.

- Say what happened and what it means. "We couldn't tell what time zone these 12 photos were taken
  in" beats "Oops!"
- Never claim more confidence than the data supports. §2c of PLAN.md tracks *how* a photo's zone was
  resolved precisely so the UI can be honest about it.
- Emotion belongs in the album, not the chrome. The book is the sentimental object; the app is the
  thing that makes it without fuss.

## 7. Accessibility is part of the brand

Not a checklist appended to it. Two of Waypoint's three most serious findings were invisible to
every automated layer it had, and both were found by a person driving the real app.

The standing rules, all of which have already cost somebody a day:

- **Do not disable a control in response to activating it.** Disabling the element that holds focus
  drops focus to `<body>`. Guard the handler instead; where something must read as unavailable, use
  `aria-disabled` plus a refusing handler — which is also the only way its `aria-describedby` reason
  can ever be read. **A jsdom test will pass on the broken version**, because jsdom does not blur on
  disable.
- **Mount live regions empty from first render.** A region that is `display: none` until it has
  content enters the accessibility tree in the same commit as its first message, and that is the one
  case a live region does not survive. It works from the *second* message on, so it looks fine to
  anyone who tests by triggering it twice.
- **`role="status"` is a page-wide namespace and is implicitly atomic.** Scope selectors to a
  container, and park nothing inside a status region that you do not want recited in full on every
  update.
- **Never encode state in hue alone** (WCAG 1.4.1). A selected item needs a shape, a rule, a mark or
  a position as well as a colour.
- **Contrast is a gate, and it is measured.** Re-derive rather than trust a swatch:

  ```js
  const lin = c => { c /= 255; return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const L = h => { const n = parseInt(h.slice(1),16);
    return 0.2126*lin(n>>16&255) + 0.7152*lin(n>>8&255) + 0.0722*lin(n&255); };
  const ratio = (a,b) => { const x=L(a), y=L(b), [hi,lo] = x>y?[x,y]:[y,x];
    return (hi+0.05)/(lo+0.05); };
  ```

  Four lines of node, no dependency and no Python. Waypoint's contrast gate was a Python script that
  **could not run on one of the two development machines** — a gate only half the team can operate
  is not a gate. Every number in §3 came out of the snippet above.
- **The photo grid is the hard accessibility surface**, and it is new. Hundreds of similar items,
  multi-select, drag to reorder. Every one of those needs a keyboard path and an announced count,
  and "selected 47 of 412" is a live region that will be updated far more often than any Waypoint
  ever had.
