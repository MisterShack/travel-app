# CSS wanted by `EventPasses.tsx`

Class names used by the per-event passes panel that do not yet exist in
`app/src/styles.css`. **Nothing here has been merged** — I did not touch
`styles.css`, because another agent is working in it. Every value below is a
token; there are no literal colours, sizes or spacings.

Already existing and reused unchanged: `.field`, `.field-label`, `.muted`,
`.tiny`, `.error`, `.grow`, `button.secondary`, `button.danger`, `.skeleton`.

Suggested rules, in the shape `.nearby` already uses so the two panels on an
event page read as siblings rather than as two different ideas:

```css
/* ------------------------------------------------------- event passes -- */

/*
 * The passes on one event. Same panel shape as `.nearby`, and for the same
 * reason: it hangs off a saved event rather than being part of the form. No
 * kind hue — a pass is not an event.
 */
.event-passes {
  margin-top: var(--space-8);
  padding: var(--space-4);
  background: var(--surface-sunk);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}
.event-passes h3 { margin: 0; font-size: var(--text-base); line-height: var(--lh-base); }
.event-passes > .muted.tiny { margin: var(--space-1) 0 0; }

/* A file input is the one control whose own button the browser draws, so it
   gets the field border and nothing else — styling further starts a fight with
   four rendering engines. Never below 16px: iOS zooms the viewport on focus. */
.pass-file {
  font: var(--text-base)/var(--lh-base) var(--sans);
  background: var(--surface);
  border: 1px solid var(--field);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  width: 100%;
  min-height: 44px;
}

/* The loading placeholder. It carries `.skeleton` for the pulse and needs a
   box of its own, because `.skeleton` sets no size — the existing users of it
   all sit inside `.skeleton-row`, which does. */
.pass-skeleton { display: block; height: 20px; width: 60%; margin-top: var(--space-3); }

/*
 * The live region. **Never `display: none`** — it is mounted empty from first
 * render, because a region that appears in the same commit as its first message
 * is not announced at all. `:empty` therefore takes the margin away and nothing
 * else, exactly as `.nearby-live` does. (It is an `aria-live` div rather than a
 * `role="status"` one; see the component for why this screen holds only one
 * status region.)
 */
.passes-live { margin-top: var(--space-3); }
.passes-live:empty { margin-top: 0; }
.passes-live > p { margin: 0; }
.passes-live > p + p { margin-top: var(--space-1); }

.pass-list { list-style: none; margin: var(--space-3) 0 0; padding: 0; }
.pass-row {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--rule);
}
.pass-row:first-child { border-top: 0; }
.pass-row .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pass-row .muted.tiny { margin: var(--space-1) 0 0; }

/*
 * The pass's own name is the control that opens it. It reads as a link because
 * that is what it does, but it is a button — opening a pass is a fetch, a blob
 * URL and a revoke, not a navigation. 44px in both dimensions like every other
 * control (BRAND.md §7), carried by padding so it still grows at 200% text.
 */
.pass-open {
  background: none;
  border: 0;
  padding: var(--space-2) 0;
  min-height: 44px;
  color: var(--accent);
  font: 600 var(--text-base)/var(--lh-base) var(--sans);
  text-align: left;
  justify-content: flex-start;
  width: 100%;
}
.pass-open:hover { text-decoration: underline; text-underline-offset: 2px; }

/* The inline confirmation. It replaces the row's Remove button in place, so the
   row must not jump: the question wraps above the two buttons on a narrow
   screen rather than pushing them off the edge. */
.pass-confirm {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--space-2);
}
.pass-confirm > .muted.tiny { margin: 0; flex-basis: 100%; }
```

One thing to check when merging: `.pass-open` sets `background: none; border: 0`
after the global `button` rule, so it must come **after** the button block in
the file or the accent fill wins.
