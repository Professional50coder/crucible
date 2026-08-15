# Crucible — design notes

The tokens this interface is built from, and why each one is what it is.
Everything here lives in `tailwind.config.ts` and `src/app/globals.css`; nothing
in a component should introduce a value that is not on one of these scales.

---

## The thesis

Crucible is an instrument panel for verifiable infrastructure, not a product
page. A Model Passport is read by a stranger who has no wallet, no account, and
no reason to trust the person who sent them the link — so the interface has to
look like something that reports rather than something that sells.

Three consequences that drove every decision below:

1. **Colour is signal.** The ground and every surface are neutral greys. The one
   chromatic accent (`phosphor`) is reserved for things you can act on and
   numbers that matter. State colours (ok / warn / danger / info) never appear
   decoratively — a red on this page always means something is wrong.
2. **Hairlines, not shadows.** Depth comes from 1px borders and a one-step
   surface lift, the way it does on a schematic. There is exactly one shadow in
   the app, on the command palette, because a floating modal genuinely is above
   the page.
3. **Structure is drawn.** Dashed column guides, hatched section bands and a
   faint dot field are construction marks. They say the page was laid out to a
   measure. They are the cheapest way to make a dark page read as deliberate
   rather than empty.

---

## Palette

Near-monochrome by design. Contrast ratios are measured against `panel`, the
surface most text sits on.

| Token         | Hex       | Role                                                | Contrast |
| ------------- | --------- | --------------------------------------------------- | -------- |
| `ink`         | `#131414` | Page ground. Neutral dark grey — not black, not blue-black. | — |
| `sub`         | `#0d0e0e` | Recessed wells: inputs, code, log panels, chain links | — |
| `panel`       | `#191a1a` | Card surface, one step above the ground              | — |
| `raised`      | `#202121` | Hover / secondary surface                            | — |
| `line`        | `#282a29` | Hairline borders and dividers                        | — |
| `line-bright` | `#383a38` | Emphasised border; dashed guides                     | — |
| `fg`          | `#ecedea` | Primary text                                         | 15.4:1 |
| `dim`         | `#a6a8a2` | Body copy, secondary values                          | 7.2:1 |
| `faint`       | `#82847e` | Labels, captions, notes — the dimmest allowed        | 4.6:1 |
| `phosphor`    | `#c8f050` | The single accent: links, focus rings, totals, active state | 12.6:1 |
| `ok`          | `#4ade80` | Verified, complete                                   | 10.1:1 |
| `warn`        | `#fbbf24` | At risk, pending, queued                             | 11.4:1 |
| `danger`      | `#f87171` | Failed, destructive, integrity mismatch              | 6.4:1 |
| `info`        | `#7dd3fc` | Testnet, neutral informational                       | 10.9:1 |

`faint` at 4.6:1 is the floor. Nothing smaller than 11px and nothing dimmer than
`faint` ships. The previous palette's `#5b646b` sat around 2.9:1 and is gone.

The ground moved from `#070809` (near-black, faintly blue) to `#131414`. Pure
black makes every border look like a scratch; a hue-free grey lets the lime read
as the only colour in the room.

---

## Type

No webfont is loaded. The build must succeed offline and a provenance page that
waits on a CDN is a provenance page that can fail to render. The stacks are
ordered so a machine with a good mono uses it:

- **Sans** — `Inter`, then the system UI stack. Used for prose only.
- **Mono** — `JetBrains Mono`, `IBM Plex Mono`, then `ui-monospace`. Used for
  **every** hash, address, id, number, label, button and timestamp. Mono is the
  house voice; sans is the exception.

`font-variant-numeric: tabular-nums` is applied to all mono text so a running
countdown never reflows.

### Scale

| Token       | Size                                    | Use |
| ----------- | --------------------------------------- | --- |
| `2xs`       | 0.6875rem / 1rem                        | Labels, captions, keycaps |
| `xs`        | 0.75rem                                 | Notes, table cells, badges |
| `[13px]`    | 0.8125rem                               | Hash values, chain-link titles |
| `sm`        | 0.875rem                                | Body copy, card titles |
| `base`/`lg` | 1rem / 1.125rem                         | Hero sub-copy only |
| `title`     | `clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem)` | Section and page headings |
| `readout`   | `clamp(1.75rem, 1.2rem + 2.2vw, 2.75rem)` | Countdowns and instrument numbers |
| `display`   | `clamp(2rem, 1.2rem + 3.4vw, 3.75rem)`  | The one `h1` on the landing page |

The three largest steps are fluid, so 360px and 2560px both get a sensible
measure with no breakpoint jump. Tracking tightens as size grows
(`-0.018em` → `-0.022em`); the `.label` class goes the other way at `0.18em`,
which is what makes an uppercase 11px mono label read as an instrument legend
rather than shouting.

Prose is capped at `62ch` via `.measure`. Body line-height is 1.5–1.65.

---

## Space and rhythm

4px base. Section rhythm is deliberately coarse so the hatched bands have room
to work:

- Inside a card: `16px` / `20px` padding (`px-4 py-4`, `sm:px-5`)
- Between cards: `16px` (`gap-4`), or `1px` when cards share a `bg-line` grid
- Section padding: `56px` mobile → `80px` desktop (`py-14 sm:py-20`)
- Page top: `48px` → `64px`

Content column is `max-w-6xl` (1152px) for tools and `max-w-5xl` (1024px) for
the passport, which is a reading document. Gutters are `16px` → `24px`.

The **dashed column guides** (`ColumnGuides` in `ui.tsx`) are drawn at exactly
those column edges, fixed behind the page, desktop only. On a phone the column
edge *is* the screen edge, so the lines would be noise.

---

## Radii

| Token       | Value      | Use |
| ----------- | ---------- | --- |
| `rounded-sm` | 4px       | Badges, filter chips, keycaps |
| `rounded`    | 6px       | Small inline affordances |
| `rounded-md` | 8px       | Buttons, inputs, icon tiles, wells |
| `rounded-lg` | 0.625rem  | **Cards and panels.** The card radius. |
| `rounded-xl` | 14px      | Reserved |

10px is soft enough that a card reads as a surface and tight enough that it
still reads as an instrument. Nothing in the app is pill-shaped except progress
tracks, where the round cap is what makes a 3px bar legible.

---

## Motion

| Purpose | Duration | Easing |
| --- | --- | --- |
| Colour / border hover | 150ms | `ease` (Tailwind default) |
| Content entrance (`fadeup`) | 220ms | `ease-out` |
| Command palette open (`popin`) | 160ms | `cubic-bezier(.16,1,.3,1)` |
| Certificate foil rule (`drawline`) | 600ms | `cubic-bezier(.16,1,.3,1)` |
| Progress / countdown bars | 700–1000ms | `ease` — they track data, not taste |
| Live-state pulse (`pulseline`) | 1.8s loop | `ease-in-out` |
| Skeleton sweep | 2.4s loop | `linear` |

Four animations exist in total and each one reports something: an element
arrived, a panel opened, a certificate was sealed, a value is still live.
`prefers-reduced-motion: reduce` collapses every animation and transition to
0.01ms and disables smooth scrolling — the countdown still counts, it just does
not tween.

---

## Structural texture

Three utilities carry the "engineered" register, all in `globals.css`:

- **`.hatch` / `.hatch-accent`** — 45° repeating hairlines at 7px pitch. Used as
  a full-bleed band between major sections (`HatchBand`) and once inside the
  landing hero, over the lineage receipt, to mark the moment the data is lost.
  Hatching marks a cut on a drawing; that is exactly what a section seam is.
- **`.dotfield`** — 10px radial dot grid. Fills genuinely empty regions: empty
  states, the dataset drop zone, the "no logs yet" panel.
- **Body dot field** — the same idea at 14px pitch and 4.5% opacity, fixed, so
  the wide margins at 2560px read as ground rather than void.

---

## Components worth knowing

- **`IconTile`** — a 36px bordered square holding a 16px glyph. The left-hand
  anchor of every card, panel header and chain link. It is what stops a grid of
  bordered rectangles reading as a generic SaaS card grid.
- **`Hash`** — every hash, address and id in the app. Middle-truncated
  (`0xb4f76a88…2c75a7`, because you compare hashes by their ends), monospace,
  full value in `title`, always with a copy button, and with an explorer link
  wherever a verification target exists.
- **Chain of custody** (`PassportView`) — six links drawn as a physical chain:
  base model → dataset → training config → provider → adapter → TEE signer. The
  connector runs behind the icon tiles so the six cards read as one continuous
  claim rather than a stack of rows. This is the page's signature element and
  the only place the layout does something structurally unusual.
- **`AckCountdown` window strip** — the 48-hour window drawn to scale, with
  Crucible's acknowledgement marked in its first pixel and the deadline a whole
  bar-width away. "We handle this for you" becomes a distance you can see.
- **`CommandPalette`** — `Ctrl/Cmd+K`, portalled to `<body>` (the header's
  `backdrop-filter` would otherwise trap a fixed child), with the index loaded
  lazily on first open.

---

## Icons

Twelve hand-drawn glyphs on a 16-unit grid in `src/components/icons.tsx`, all at
1.2px stroke weight to match the interface's hairlines. No icon package, and no
emoji anywhere.

Every glyph carries explicit `width`/`height` attributes as well as its utility
classes. Classes win when the stylesheet is present; the attributes are what
stop a `viewBox`-only SVG from expanding to fill the viewport if CSS ever fails
to load. The landing page reads top-to-bottom as plain text with styles
disabled — a CSS hiccup during a demo recording is survivable, not fatal.

---

## Accessibility floor

- Skip link to `#main`, semantic landmarks, one `h1` per route, no skipped levels.
- Visible focus: 2px `phosphor` ring with a 2px `ink` offset on every focusable
  element. Nothing removes an outline.
- All text ≥ 4.5:1. Colour never carries meaning alone — state is always
  accompanied by an icon, a word, or both.
- No horizontal page scroll at any width from 360px to 2560px. Wide content
  (logs, raw manifest, provider tables) lives in its own `.scroll-x` container.
- Loading, empty and error states are written, not spun: each says what is
  happening or what went wrong and what to do next.

---

## What was deliberately not done

- **No purple-to-blue gradient, no glassmorphism, no centred marketing hero.**
  The landing page opens with the actual stdout of a fine-tuning run and the
  hatched band that marks where it is lost.
- **No numbered `01 / 02 / 03` markers on the problem list.** The footguns are
  not a sequence, so they are labelled by the stage where they bite —
  *at task creation*, *after funding*, *after upload* — which encodes something
  true. Numbering survives only in "verify this yourself", where the steps
  genuinely are ordered.
- **No second accent.** One accent doing real work, and four state colours that
  are never used for decoration.
