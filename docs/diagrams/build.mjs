/**
 * Diagram generator for Crucible.
 *
 * Every diagram in docs/diagrams is emitted from this file so they share one
 * design system: same palette, same type scale, same card geometry. Edit here,
 * re-run `node docs/diagrams/build.mjs`, and all of them stay consistent.
 *
 * SVG is the source of truth (it stays legible when zoomed and diffs as text).
 * PNGs are rendered from it for places that will not display SVG.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
mkdirSync(OUT, { recursive: true })

// ---------------------------------------------------------------------------
// Design system
// ---------------------------------------------------------------------------

const FONT = "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif"
const MONO = "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace"

const C = {
  page: '#FCFDFE',
  ink: '#16202A',
  dim: '#5C6B7A',
  faint: '#8A98A6',
  rule: '#E3E9EE',
  cardBg: '#FFFFFF',

  // plane identities
  slateBg: '#F4F7F9', slateEdge: '#C9D5DF', slateInk: '#5A6B7B',
  amberBg: '#FDF8EF', amberEdge: '#E0B15C', amberInk: '#A9762A',
  greenBg: '#F1F8F4', greenEdge: '#7FB79A', greenInk: '#3F7A5E',
  tealBg: '#EFF6F8', tealEdge: '#8FB6C4', tealInk: '#3D6E80',

  crimson: '#B3272D',
  amber: '#C98A1E',
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Wrap a subtitle onto at most two lines at an approximate character width. */
function wrap(text, max) {
  const words = String(text).split(' ')
  const lines = ['']
  for (const w of words) {
    const line = lines[lines.length - 1]
    if (line.length === 0) lines[lines.length - 1] = w
    else if (line.length + 1 + w.length <= max) lines[lines.length - 1] = `${line} ${w}`
    else lines.push(w)
  }
  return lines.slice(0, 3)
}

function text(x, y, s, o = {}) {
  const {
    size = 13, fill = C.ink, weight = 400, anchor = 'start',
    family = FONT, spacing = 0, opacity = 1,
  } = o
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" ` +
    `fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}` +
    `${opacity !== 1 ? ` opacity="${opacity}"` : ''}>${esc(s)}</text>`
}

/** A titled card with an optional subtitle and an optional coloured left edge. */
function card(x, y, w, h, title, sub, o = {}) {
  const { edge = null, titleSize = 15, mono = false } = o
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${C.cardBg}" stroke="${C.rule}"/>`
  if (edge) s += `<rect x="${x}" y="${y}" width="3.5" height="${h}" rx="1.75" fill="${edge}"/>`
  const tx = x + (edge ? 17 : 13)
  s += text(tx, y + 25, title, { size: titleSize, weight: 600, family: mono ? MONO : FONT })
  if (sub) {
    wrap(sub, Math.floor((w - 30) / 5.35)).forEach((line, i) => {
      s += text(tx, y + 45 + i * 15, line, { size: 11.5, fill: C.dim })
    })
  }
  return s
}

/** A vertical plane: tinted panel, small-caps header, cards, bold footer note. */
function plane(x, y, w, h, header, cards, footer, tone) {
  const bg = C[`${tone}Bg`], edge = C[`${tone}Edge`], ink = C[`${tone}Ink`]
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${edge}"/>`
  s += text(x + 20, y + 30, header.toUpperCase(), { size: 11, weight: 600, fill: ink, spacing: 1.1 })
  let cy = y + 52
  for (const c of cards) {
    const ch = c.sub ? 44 + wrap(c.sub, Math.floor((w - 70) / 5.35)).length * 15 : 44
    s += card(x + 20, cy, w - 40, ch, c.title, c.sub, { edge: c.edge, mono: c.mono })
    cy += ch + 13
  }
  s += text(x + 20, y + h - 22, footer.toUpperCase(), { size: 10.5, weight: 700, fill: ink, spacing: 0.7 })
  return s
}

function arrow(x1, y, x2, label, sub) {
  let s = `<line x1="${x1}" y1="${y}" x2="${x2 - 9}" y2="${y}" stroke="${C.ink}" stroke-width="1.6"/>` +
    `<path d="M ${x2} ${y} L ${x2 - 10} ${y - 5} L ${x2 - 10} ${y + 5} Z" fill="${C.ink}"/>`
  const mid = (x1 + x2) / 2
  if (label) s += text(mid, y - 14, label, { size: 12.5, anchor: 'middle', weight: 500 })
  if (sub) s += text(mid, y + 22, sub, { size: 10.5, anchor: 'middle', fill: C.faint })
  return s
}

function legend(x, y, items) {
  let s = '', cx = x
  for (const it of items) {
    if (it.kind === 'swatch') {
      s += `<rect x="${cx}" y="${y - 9}" width="12" height="12" rx="2.5" fill="#fff" stroke="${it.color}" stroke-width="1.6"/>`
      cx += 20
    } else if (it.kind === 'edge') {
      s += `<rect x="${cx}" y="${y - 10}" width="4" height="14" rx="2" fill="${it.color}"/>`
      cx += 14
    } else if (it.kind === 'dash') {
      s += `<line x1="${cx}" y1="${y - 3}" x2="${cx + 28}" y2="${y - 3}" stroke="${it.color}" stroke-width="1.8" stroke-dasharray="5 4"/>`
      cx += 36
    }
    s += text(cx, y, it.label, { size: 11.5, fill: C.dim })
    cx += it.label.length * 6.1 + 30
  }
  return s
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<rect width="${w}" height="${h}" fill="${C.page}"/>
${body}
</svg>`
}

const write = (name, s) => { writeFileSync(join(OUT, name), s); console.log(`  ${name}  ${(s.length / 1024).toFixed(1)} kB`) }

// ---------------------------------------------------------------------------
// 1. Architecture — four planes, left to right
// ---------------------------------------------------------------------------

{
  const W = 1736, H = 806
  const py = 84, ph = 500
  const cols = [40, 480, 920, 1360]
  const cw = 336

  let b = ''

  b += text(W / 2, 44, 'VERIFICATION BOUNDARY', { size: 12, weight: 700, anchor: 'middle', fill: C.crimson, spacing: 1.4 })
  b += `<line x1="${cols[3] - 32}" y1="60" x2="${cols[3] - 32}" y2="${py + ph}" stroke="${C.crimson}" stroke-width="2" stroke-dasharray="7 6" opacity="0.85"/>`

  b += plane(cols[0], py, cw, ph, 'Source plane · what you bring', [
    { title: 'A dataset', sub: 'CSV or JSONL · 10 examples minimum · any of the three shapes 0G accepts' },
    { title: 'A training config', sub: 'exactly five keys — epochs, batch, learning rate, max steps, NEFTune alpha' },
    { title: 'A funded wallet', sub: '0.15 0G is enough on testnet. The SDK asks for 3; that guard is client-side' },
  ], 'No CLI. No twelve-step flow.', 'slate')

  b += plane(cols[1], py, cw, ph, 'Crucible plane · your machine', [
    { title: '@crucible/core', sub: 'validate · convert · estimate · canonicalise — 147 tests, no network', edge: C.amber },
    { title: 'services/orchestrator', sub: 'job store · poller · SSE stream · restart-safe — 174 tests' },
    { title: 'Acknowledge daemon', sub: 'acts on arrival, never at the buzzer. Only ever calls acknowledgeModel', edge: C.crimson },
    { title: 'apps/web', sub: 'upload → configure → launch → watch → passport — 310 tests' },
  ], 'Every footgun caught before funds move.', 'amber')

  b += plane(cols[2], py, cw, ph, '0G plane · the network', [
    { title: '0G Compute', sub: 'fine-tuning provider · 1× H200 in an Intel TDX enclave · 800 neuron/token' },
    { title: '0G Storage', sub: 'dataset root hash and manifest root hash — what the passport commits to' },
    { title: '0G Chain', sub: 'Passport.sol deployed + verified · 0.8.19 / paris · chain 16602' },
    { title: 'Agentic ID · ERC-7857-style', sub: 'one token per fine-tune, carrying the lineage hashes' },
  ], 'All four components. Each load-bearing.', 'green')

  b += plane(cols[3], py, cw, ph, 'Surface plane · what a stranger sees', [
    { title: 'Model Passport page', sub: 'every hash rendered beside the link that verifies it' },
    { title: 'Public gallery', sub: 'every passport ever minted, open to anyone' },
    { title: 'verifyManifest()', sub: 'recompute the hash yourself; the chain says true or false', mono: true },
  ], 'No wallet. No trust in us.', 'slate')

  const ay = py + ph - 62
  b += arrow(cols[0] + cw, ay, cols[1], 'validate', 'before funds move')
  b += arrow(cols[1] + cw, ay, cols[2], 'execute', 'task · upload')
  b += arrow(cols[2] + cw, ay, cols[3], 'publish', 'hashes, not claims')

  const xy = py + ph + 26
  b += `<rect x="40" y="${xy}" width="${W - 80}" height="112" rx="8" fill="${C.tealBg}" stroke="${C.tealEdge}"/>`
  b += text(60, xy + 28, 'CROSS-CUTTING · TOUCHES EVERY PLANE, OWNED BY NONE', { size: 11, weight: 600, fill: C.tealInk, spacing: 1.1 })
  const xw = 389
  const xs = [
    ['Canonical manifest', 'keys sorted recursively, no whitespace'],
    ['keccak256 anchor', 'one hash, computed in exactly one place'],
    ['The 48-hour clock', 'starts at Delivered. Nothing else warns you'],
    ['TEE signer 0x2413…583A', 'acknowledged on-chain, readable with no key'],
  ]
  xs.forEach(([t, s], i) => { b += card(60 + i * (xw + 13), xy + 40, xw, 56, t, s) })

  b += legend(40, H - 52, [
    { kind: 'swatch', color: C.slateEdge, label: 'Source / surface' },
    { kind: 'swatch', color: C.amberEdge, label: 'Crucible (local)' },
    { kind: 'swatch', color: C.greenEdge, label: '0G network' },
    { kind: 'edge', color: C.crimson, label: 'Crimson edge = on the 48-hour path' },
    { kind: 'dash', color: C.crimson, label: 'Verification boundary — nothing right of here is taken on our word' },
  ])

  b += text(40, H - 20, 'Verified on-chain 2026-08-16 (Galileo, chain 16602): Passport.sol deployed and source-verified at 0x27087B5b…83C1c7 · passports #1 and #2 minted · manifest on 0G Storage at 0xc757a7e6…8e1140, hashing to the anchored value. Three paid fine-tuning runs. Task 10551604 force-settled UNACKNOWLEDGED — 30% penalty, model lost; task b1807e85 was acknowledged by the daemon itself at delivery+1h and its 93.6 MB adapter retrieved. Nothing is deployed to mainnet.',
    { size: 10.5, fill: C.faint })

  write('architecture.svg', svg(W, H, b))
}

// ---------------------------------------------------------------------------
// 2. Lifecycle — 0G's real state machine and the two ways it ends badly
// ---------------------------------------------------------------------------

{
  const W = 1680, H = 640
  let b = ''

  b += text(40, 46, 'THE TASK LIFECYCLE — AND THE TWO WAYS IT ENDS BADLY', { size: 15, weight: 700, spacing: 0.8 })
  b += text(40, 70, "0G's own states, mirrored exactly. Crucible invents no progress bar.", { size: 12.5, fill: C.dim })

  const states = ['Init', 'SettingUp', 'SetUp', 'Training', 'Trained', 'Delivering', 'Delivered', 'UserAcknowledged', 'Finished']
  const sy = 130, sh = 52
  let x = 40
  states.forEach((s, i) => {
    const w = 12 + s.length * 8.6
    const hot = s === 'Delivered'
    const done = s === 'Finished'
    b += `<rect x="${x}" y="${sy}" width="${w}" height="${sh}" rx="6" fill="${hot ? '#FDF1F1' : done ? C.greenBg : '#FFFFFF'}" stroke="${hot ? C.crimson : done ? C.greenEdge : C.rule}" stroke-width="${hot ? 1.8 : 1}"/>`
    b += text(x + w / 2, sy + 32, s, { size: 13, anchor: 'middle', weight: hot || done ? 600 : 400, family: MONO, fill: hot ? C.crimson : C.ink })
    if (i < states.length - 1) {
      b += `<line x1="${x + w}" y1="${sy + sh / 2}" x2="${x + w + 20}" y2="${sy + sh / 2}" stroke="${C.faint}" stroke-width="1.4"/>` +
        `<path d="M ${x + w + 26} ${sy + sh / 2} L ${x + w + 18} ${sy + sh / 2 - 4} L ${x + w + 18} ${sy + sh / 2 + 4} Z" fill="${C.faint}"/>`
    }
    x += w + 26
  })
  b += text(x - 12, sy + 32, '· Failed', { size: 12.5, fill: C.faint, family: MONO })

  // the clock
  const dx = 40 + 6 * 0 // Delivered box start, computed below for the bracket
  let cx = 40
  states.forEach((s) => { if (s === 'Delivered') return; })
  // recompute Delivered x
  let px = 40
  for (const s of states) { if (s === 'Delivered') break; px += 12 + s.length * 8.6 + 26 }
  const dw = 12 + 'Delivered'.length * 8.6

  b += `<line x1="${px + dw / 2}" y1="${sy + sh}" x2="${px + dw / 2}" y2="${sy + sh + 40}" stroke="${C.crimson}" stroke-width="1.6" stroke-dasharray="5 4"/>`
  b += text(px + dw / 2, sy + sh + 62, '48-HOUR CLOCK STARTS HERE', { size: 12, weight: 700, anchor: 'middle', fill: C.crimson, spacing: 0.8 })
  b += text(px + dw / 2, sy + sh + 82, 'No email. No dashboard. No warning of any kind.', { size: 11.5, anchor: 'middle', fill: C.dim })

  // outcomes
  const oy = 330, ow = 520, oh = 190
  b += `<rect x="40" y="${oy}" width="${ow}" height="${oh}" rx="8" fill="#FDF1F1" stroke="${C.crimson}" stroke-opacity="0.5"/>`
  b += text(62, oy + 30, 'IF THE CLOCK RUNS OUT', { size: 11, weight: 700, fill: C.crimson, spacing: 1.1 })
  b += card(62, oy + 44, ow - 44, 56, 'The model is gone', 'and 30% of the fee is deducted. The task is over.')
  b += card(62, oy + 112, ow - 44, 56, 'Nothing told you', 'you were expected to poll a CLI until you noticed.')

  b += `<rect x="${40 + ow + 24}" y="${oy}" width="${ow}" height="${oh}" rx="8" fill="#FDF1F1" stroke="${C.crimson}" stroke-opacity="0.5"/>`
  b += text(62 + ow + 24, oy + 30, 'IF YOU TAKE THE LEGACY PATH', { size: 11, weight: 700, fill: C.crimson, spacing: 1.1 })
  b += card(62 + ow + 24, oy + 44, ow - 44, 56, 'The queue locks permanently', 'every later addDeliverable reverts: previous deliverable not acknowledged.')
  b += card(62 + ow + 24, oy + 112, ow - 44, 56, 'Documented in a TSDoc comment', 'reported by a hackathon user in May 2026. Nowhere else.')

  const gx = 40 + (ow + 24) * 2
  b += `<rect x="${gx}" y="${oy}" width="${W - gx - 40}" height="${oh}" rx="8" fill="${C.greenBg}" stroke="${C.greenEdge}"/>`
  b += text(gx + 22, oy + 30, 'WHAT CRUCIBLE DOES INSTEAD', { size: 11, weight: 700, fill: C.greenInk, spacing: 1.1 })
  b += card(gx + 22, oy + 44, W - gx - 84, 56, 'Acknowledges on arrival', 'the daemon acts as soon as Delivered lands, not at the buzzer.')
  b += card(gx + 22, oy + 112, W - gx - 84, 56, 'Cannot reach the locked state', 'a test asserts the deprecated path is never called. Unreachable, not merely avoided.')

  b += text(40, H - 30, 'Crucible hit this itself on its first real run: the delivered model failed to download on Windows — the bundled 0g-storage-client is a Linux binary — and the TEE fallback returned HTTP 429. The retry loop is the product.',
    { size: 11, fill: C.faint })

  write('lifecycle.svg', svg(W, H, b))
}

// ---------------------------------------------------------------------------
// 3. Verification — what a stranger can check, and what nobody can
// ---------------------------------------------------------------------------

{
  const W = 1680, H = 620
  let b = ''

  b += text(40, 46, 'HOW A STRANGER VERIFIES A PASSPORT', { size: 15, weight: 700, spacing: 0.8 })
  b += text(40, 70, 'No wallet. No account. No trust in us. Four checks, any order.', { size: 12.5, fill: C.dim })

  const steps = [
    ['1 · Fetch the manifest', '0G Storage, by root hash', 'The passport page links it. Or find the upload on storagescan.0g.ai — we do not serve it.'],
    ['2 · Recompute the hash', 'sort keys · no whitespace · keccak256', 'Canonicalisation is deterministic by design: identical content must serialise byte-identically.'],
    ['3 · Ask the chain', 'verifyManifest(tokenId, yourHash)', 'Returns true only if your hash equals the one anchored at mint. False means it was altered.'],
    ['4 · Check the inputs', 'dataset · base model · TEE signer', 'Retrieve the dataset at its root hash. Compare the base model hash. Read the TEE signer from 0G Compute.'],
  ]
  const w = 385, gap = 15
  steps.forEach(([t, s, d], i) => {
    const x = 40 + i * (w + gap)
    b += `<rect x="${x}" y="100" width="${w}" height="210" rx="8" fill="${C.cardBg}" stroke="${C.rule}"/>`
    b += `<rect x="${x}" y="100" width="${w}" height="4" rx="2" fill="${C.greenEdge}"/>`
    b += text(x + 20, 138, t, { size: 14.5, weight: 600 })
    b += text(x + 20, 160, s, { size: 11.5, fill: C.greenInk, family: MONO })
    wrap(d, 46).forEach((line, k) => b += text(x + 20, 190 + k * 17, line, { size: 12, fill: C.dim }))
    if (i < steps.length - 1) {
      b += `<path d="M ${x + w + gap - 4} 205 L ${x + w + 3} 200 L ${x + w + 3} 210 Z" fill="${C.faint}"/>`
    }
  })

  b += `<rect x="40" y="340" width="${(W - 95) / 2}" height="180" rx="8" fill="${C.greenBg}" stroke="${C.greenEdge}"/>`
  b += text(62, 370, 'WHAT THIS PROVES', { size: 11, weight: 700, fill: C.greenInk, spacing: 1.1 })
  ;[
    'This adapter’s artifacts hash-match what was anchored.',
    'This dataset is retrievable at exactly this root hash.',
    'This provider’s TEE signer is acknowledged on-chain.',
    '0G’s own integrity check passed on delivery.',
  ].forEach((l, i) => b += text(62, 398 + i * 26, `— ${l}`, { size: 13 }))

  const rx = 40 + (W - 95) / 2 + 15
  b += `<rect x="${rx}" y="340" width="${(W - 95) / 2}" height="180" rx="8" fill="#FDF1F1" stroke="${C.crimson}" stroke-opacity="0.5"/>`
  b += text(rx + 22, 370, 'WHAT IT DOES NOT PROVE', { size: 11, weight: 700, fill: C.crimson, spacing: 1.1 })
  b += text(rx + 22, 400, 'That the provider actually ran the epochs it claimed.', { size: 13.5, weight: 600 })
  wrap('Proving that needs zero-knowledge proofs over the training computation itself — PEFT-restricted update circuits enforcing optimizer semantics, as in arXiv 2510.16830. That is a research programme, not a sixteen-day build. It is on the roadmap, and it is stated here because a technical judge will ask.', 78)
    .forEach((line, i) => b += text(rx + 22, 428 + i * 19, line, { size: 12.5, fill: C.dim }))

  b += text(40, H - 26, 'Crucible proves lineage, not honest training. Every document in this repository says so in the same words.', { size: 11, fill: C.faint })

  write('verification.svg', svg(W, H, b))
}

console.log('done')
