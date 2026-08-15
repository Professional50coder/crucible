# Frontend improvement map

Assessed against the live app on 2026-08-16 (`/gallery`, `/passport/p-000001`, `/jobs`) and against
the prevailing crypto-UI visual language.

**The register stays.** The reference designs are dashboard-luxe — aurora gradients, glass panels,
device mockups, charts as decoration. Crucible is a *certificate*, and its credibility comes from
looking like an instrument rather than a landing page. Monospace, near-black, dense, no ornament.
That is a deliberate difference, not a gap, and it is worth more here than another purple gradient.

What the reference set does better and we should take: **depth**, **numeric hierarchy**, **one
accent with a job**, and **a hero moment**. Everything below is scoped to those.

Priority: 🔴 blocks the demo video or the submission · 🟠 visible quality gap · 🟡 polish.

---

## 🔴 P1 — The verification moment is the product, and it is currently a thin green bar

On `/passport/p-000001` the line *"Hashed in your browser just now. The result matches the value
anchored on chainscan-galileo.0g.ai — nothing in between was trusted"* is the single most important
sentence in the entire project, and it renders as a 14px status strip below the fold.

**Make it the hero.** A dedicated verification panel, above the lineage table:

- three states — `checking` → `match` → `mismatch`, with the recomputation visibly happening
- show the two hashes stacked and aligned, character-for-character, so the eye confirms the match
- the word `true` returned by `verifyManifest`, presented as a returned value, not as a claim
- a **"verify it yourself"** disclosure containing the exact `curl` and the `node tools/verify-manifest.mjs`
  line, copyable

This is the shot the demo video is built around. It should take fifteen seconds to understand with
no narration.

## 🔴 P2 — First screen wastes its impact

`/gallery` opens with ~130px of empty space, then `PUBLIC RECORD`, then the title. Above the fold a
visitor sees a heading and a stat row; the one thing that proves the project is real — token #1,
minted, on a public chain — sits below.

- Tighten the top rhythm; lift the featured passport into the first screenful.
- Lead the stat row with **`1 / 8 MINTED ON 0G`** rather than `8 PASSPORTS`. The truthful number is
  the impressive one here, because the others are fixtures.
- `TOKENS TRAINED 3,121,508` is summed across fixtures. Either label it as such or drop it —
  an impressive number that dissolves on inspection costs more than it earns.

## 🔴 P3 — `WRONG NETWORK` shouts at a visitor who has done nothing wrong

The red pill is the highest-contrast element in the header, shown to someone who simply has not
connected a wallet — and no wallet is needed to read a passport. It reads as *the site is broken*.

- Disconnected → neutral `0G Galileo` chip, quiet.
- Connected to the wrong chain → then, and only then, amber with a switch action.
- Keep `MOCK DATA` — it is honest and it is doing real work.

---

## 🟠 P4 — Typographic duality

Everything is monospace, including prose, which flattens hierarchy and makes paragraphs harder to
read at length. The fix is not to abandon mono — it is to give it a job.

| Role | Face |
|---|---|
| Hashes, addresses, task ids, code, numeric data | monospace, tabular figures |
| Headings, prose, labels, explanation | a proportional face (Inter, or the system stack) |

Hashes gain authority when they are the only monospace on the page.

## 🟠 P5 — Depth, borrowed carefully

Panels are currently flat 1px borders on near-black. The reference work reads as premium largely
through **elevation**: a two-step surface scale, a hairline top highlight, and one soft shadow.

- Define `--surface-0/1/2` and use exactly three levels.
- Hairline `rgba(255,255,255,.06)` top border on raised panels — this alone does most of the work.
- No glass, no blur, no gradient mesh.

## 🟠 P6 — One accent with a defined job

Green, red and amber are all in play, and green is doing double duty as both *brand* and *verified*.
Pin the semantics so colour carries meaning:

- **green** — verified, matched, on-chain. Never decorative.
- **red** — the model was lost, the deliverable was never acknowledged, a hash mismatched.
- **amber** — a clock is running, or a value is provider-reported rather than chain-confirmed.
- brand identity carried by type and layout, not by hue.

## 🟠 P7 — Numeric hierarchy

`#1` as a large numeral is the best single visual moment in the app. Extend the idea: fee, gas,
block, token count and the 30% penalty should have a display size, tabular figures, and a unit set
in a smaller weight. Numbers are this product's photography.

---

## 🟡 P8 — Hash presentation, standardised

One component, one truncation rule (`0x27087B5b…83C1c7`), copy-on-click with feedback, full value
on hover, and an outbound link **only when the destination resolves** — already enforced by
`provenance`, keep it.

## 🟡 P9 — Empty, loading and error states

The gallery with no passports, a job that failed, an unreachable orchestrator. Each currently
degrades to blankness. These are cheap and they are what separates a demo from a product.

## 🟡 P10 — Open Graph image per passport

A generated OG card — token number, model, `MINTED ON 0G GALILEO`, the anchor hash — so the
mandatory X post unfurls into something that looks like a certificate. Highest ratio of impression
to effort on this list, and it directly serves the 10% communication score.

## 🟡 P11 — Responsive down to a laptop

The lineage table and the raw-document disclosure are the two things that will break first.

## 🟡 P12 — Motion, sparingly

One place only: the verification recomputation. Everything else static. Motion used once is a
signal; motion used everywhere is noise.

---

## Sequence

1. **P1, P2, P3** before recording anything. They are what the video shows.
2. Screenshots for the AKINDO gallery come *after* P1–P3, not before — the form takes 1–5 images and
   they are the first thing a judge sees.
3. P4–P7 next; together they are the difference between "a dev built this" and "this is a product".
4. P8–P12 as time allows. P10 punches above its weight.

## Explicitly not doing

Aurora gradients, glassmorphism, a light theme, chart chrome, 3D device mockups, an animated hero.
Every one of them would make this look more like the reference set and less like something you would
trust with a provenance claim.
