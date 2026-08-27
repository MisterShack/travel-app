# CSS the Passes page needs

Four class names in `PassesPage.tsx` have no rule in `app/src/styles.css` yet. Nothing here was
written into that file — merge it by hand. Everything else on the screen reuses existing classes
(`card`, `row`, `grow`, `title`, `muted`, `tiny`, `empty`, `banner`, `error`, `visually-hidden`,
`screen-title`, `danger`, `secondary`), so this is the whole of it.

The page renders acceptably without these — a `<ul>` with default bullets and indent — so merging
is not urgent, but it will look like a web page until it lands.

Suggested placement: a new section after `/* -------- nearby --- */` at the end of the file, so the
comment banners stay one-per-feature.

```css
/* -------------------------------------------------------------- passes --- */

/*
 * Every pass across every trip, grouped under the trip it belongs to.
 *
 * A list, not a stack of cards, because the count is information: assistive
 * tech says how many passes a trip holds, and a reader at a gate wants to know
 * whether the one they are looking for is even here.
 */
ul.passes { list-style: none; margin: 0; padding: 0; }
ul.passes > li { margin-bottom: var(--space-3); }
ul.passes > li.card { margin-bottom: var(--space-3); }

/* Groups are separated by their own space rather than by a rule: the cards
   already carry edges, and a second divider between them reads as a table. */
.pass-group { margin-top: var(--space-6); }
.pass-group:first-of-type { margin-top: var(--space-4); }
.pass-group h3 { color: var(--ink-soft); }

/*
 * Open and Remove sit at the trailing edge of the row, and wrap under the name
 * on a narrow phone rather than squeezing a two-line pass label into a column
 * an inch wide. `align-items: center` because these are controls beside text,
 * not text beside text — `.row` aligns to the baseline, which leaves a 44px
 * button hanging below a 20px title.
 */
.pass-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
}
/* The row's own flex needs to allow the wrap the actions rely on. */
.pass-row > .row { flex-wrap: wrap; row-gap: var(--space-2); }

/* "Are you sure?" sits inline with the two answers, so the question and the
   controls that answer it are read together and nothing moves the row's
   height. */
.pass-actions > .muted.tiny { white-space: nowrap; }
```

## Two notes for whoever merges this

- **Buttons stay 44px** (BRAND.md §7). `ul.legs button { min-height: 36px }` exists on the imports
  screen; the same shrink was deliberately *not* applied here, because this is the screen someone
  uses one-handed while holding a bag.
- **The notice paragraph swaps `visually-hidden` for `banner`** rather than mounting and
  unmounting. That is load-bearing, not a style choice: a live region that is absent (or
  `display: none`) until it has content is never announced for its first message. If a
  `.pass-notice` class is added later, it must not hide the element with `display: none` when
  empty.
