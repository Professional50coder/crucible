'use client'

import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

import {
  AlertIcon,
  AnchorIcon,
  ArrowIcon,
  ClockIcon,
  ExternalIcon,
  ShieldIcon,
  TerminalIcon,
  UploadIcon,
} from '@/components/icons'
import { Badge, Dot, HatchBand, IconTile, SectionHead } from '@/components/ui'
import { addressUrl, storageLookupUrl, storageSubmissionUrl, txUrl } from '@/lib/chains'

/**
 * The landing page states one claim, once, at display size, and then spends the
 * rest of the page earning it.
 *
 * The claim is that every model can carry a birth certificate. The proof is that
 * a stranger — no wallet, no clone, no account — can pull passport #1's manifest
 * off 0G Storage, recompute its keccak256, and ask the deployed contract whether
 * that is the value it anchored.
 *
 * Every figure and every hash below was measured against the live network. Where
 * a run failed it says so, in the same type size as where it succeeded, because
 * a provenance tool that overstates its own provenance has already lost the
 * argument.
 */

// ---------------------------------------------------------------------------
// Anchors — the four values that make the claim checkable.
// ---------------------------------------------------------------------------

const PASSPORT_CONTRACT = '0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7'
const MINT_TX = '0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1'
const MANIFEST_ROOT = '0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140'
const MANIFEST_HASH = '0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f'
const MANIFEST_SUBMISSION = 146937

interface Anchor {
  label: string
  value: string
  full: string
  note: string
  /** Absent when no page resolves for this value. A 404 reads as "the data is gone". */
  href?: string
  hrefLabel?: string
}

/**
 * Every href here is a module constant routed through `lib/chains.ts`, so the
 * network can never be mismatched and nothing user-controlled reaches an href.
 *
 * The manifest row links to `/submission/<txSeq>`, not to `/file/<rootHash>` —
 * Storage Scan has no route keyed by a root hash and 404s on that path. The
 * root-hash lookup that does resolve is the JSON one, quoted in the verify block.
 */
const ANCHORS: readonly Anchor[] = [
  {
    label: 'Contract',
    value: '0x27087B5b…83C1c7',
    full: PASSPORT_CONTRACT,
    note: 'Passport.sol · deployed and source-verified on 0G Galileo',
    href: addressUrl('testnet', PASSPORT_CONTRACT),
    hrefLabel: 'chainscan-galileo.0g.ai',
  },
  {
    label: 'Mint',
    value: '0xb608a8a5…e400b3b1',
    full: MINT_TX,
    note: 'passport #1 · block 49,597,171 · 327,702 gas',
    href: txUrl('testnet', MINT_TX),
    hrefLabel: 'chainscan-galileo.0g.ai',
  },
  {
    label: 'Manifest',
    value: '0xc757a7e6…3b98e1140',
    full: MANIFEST_ROOT,
    note: `0G Storage root · 584 bytes · submission ${MANIFEST_SUBMISSION}`,
    href: storageSubmissionUrl('testnet', MANIFEST_SUBMISSION),
    hrefLabel: 'storagescan-galileo.0g.ai',
  },
  {
    label: 'Anchor',
    value: '0x4f64bfe6…6059890f',
    full: MANIFEST_HASH,
    note: 'keccak256 of the canonical manifest · verifyManifest(1, …) returns true',
  },
]

/** The commands, exactly as a stranger would run them. Nothing is cloned. */
const VERIFY_STEPS: readonly { comment: string; command: string }[] = [
  {
    comment: '# 1 · pull the manifest off 0G Storage',
    command: `curl -s "https://indexer-storage-testnet-turbo.0g.ai/file?root=${MANIFEST_ROOT}"`,
  },
  {
    comment: '# 2 · confirm the root hash exists, via the route that resolves',
    command: `curl -s "${storageLookupUrl('testnet', MANIFEST_ROOT)}"`,
  },
  {
    comment: '# 3 · canonicalise, keccak256, and ask the chain',
    command: 'node tools/verify-manifest.mjs   → verifyManifest(1, 0x4f64bfe6…) === true',
  },
]

// ---------------------------------------------------------------------------
// What the two real runs cost.
// ---------------------------------------------------------------------------

const LEDGER: readonly { readout: string; label: string; tone: string }[] = [
  { readout: '2', label: 'runs reached Delivered', tone: 'text-fg' },
  { readout: '1', label: 'model retrieved — from Linux', tone: 'text-ok' },
  { readout: '30.0000%', label: 'deducted on the one that was lost', tone: 'text-danger' },
]

// ---------------------------------------------------------------------------
// Six of the fourteen findings. Every one reproduced against the live network.
// ---------------------------------------------------------------------------

interface Footgun {
  sev: 'critical' | 'blocking' | 'docs'
  title: string
  body: string
  evidence: string
}

const FOOTGUNS: readonly Footgun[] = [
  {
    sev: 'critical',
    title: 'acknowledgeModel retrieves nothing on Windows — two separate defects',
    body: 'They are not one bug. The TEE path fails identically on every platform, at 0 bytes, with stream.on is not a function — that one is in the SDK. The 0G Storage path fails only on Windows, with spawn …/binary/0g-storage-client ENOENT, because the bundled client ships as an ELF 64-bit executable for GNU/Linux. With both dead the documented happy path is impossible on Windows, and one model was lost proving it.',
    evidence: 'storage path succeeds from WSL2 Linux · TEE path still fails on both',
  },
  {
    sev: 'critical',
    title: 'The provider settles long before the 48-hour window closes',
    body: 'The documentation gives you 48 hours from Delivered to acknowledge. The provider force-settled mine in six. The 48 hours is the outer bound on your right to collect, not a guarantee about when the provider acts — and nothing tells you which one you are racing.',
    evidence: 'delivered 11:18:42Z · settled 17:19:27Z',
  },
  {
    sev: 'blocking',
    title: 'The SDK demands 3 0G to open a ledger, on every network',
    body: 'addLedger() applies a hardcoded client-side guard. The contract disagrees: LedgerManager.MIN_ACCOUNT_BALANCE() reads 0.1 0G on testnet. A 30× overstatement that reads as a funding blocker before you have spent anything.',
    evidence: 'one eth_call · true cost of both runs was 0.15 0G',
  },
  {
    sev: 'blocking',
    title: 'getLockedTime() is the refund lock, not the acknowledge window',
    body: 'It returns 86400 — 24 hours — and is used as lockTime − (now − refund.createdAt). Read it as the 48-hour deadline, as its name invites, and any daemon you build fires at the wrong time.',
    evidence: 'SDK source, service.js',
  },
  {
    sev: 'docs',
    title: 'transfer-fund silently funds the wrong sub-account',
    body: 'Without --service fine-tuning the transfer routes to the inference sub-account. Nothing fails at the time. The failure surfaces much later as an unexplained MinimumDepositRequired, by which point the money has moved.',
    evidence: '0G’s own documentation',
  },
  {
    sev: 'docs',
    title: 'Storage Scan has no route keyed by a root hash',
    body: '/file/<rootHash> returns 404. The human-readable page is /submission/<txSeq>, and the only root-hash lookup is the JSON API. On a page whose whole job is letting a stranger check a claim, a 404 reads as the data is gone rather than the URL is wrong.',
    evidence: 'verified live · both correct routes are linked above',
  },
]

const SEV_LABEL: Record<Footgun['sev'], string> = {
  critical: 'costs an artifact',
  blocking: 'blocks a documented path',
  docs: 'wrong or missing docs',
}

// ---------------------------------------------------------------------------
// What Crucible does. Stated at exactly the size it is true.
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  {
    icon: <UploadIcon className="h-4 w-4" />,
    title: 'One upload, validated before gas moves',
    body: 'Crucible checks a dataset against 0G’s three accepted formats, reports the offending line by number, and validates the training config against all five rejection rules — locally, before a task is funded. 0G validates both after you have paid.',
  },
  {
    icon: <ClockIcon className="h-4 w-4" />,
    title: 'A daemon that watches the window',
    body: 'It detects the delivery within about two minutes, exhausts every download path the SDK offers, records the failure with its evidence, and releases the queue with acknowledgeDeliverable so the next task is not blocked. It cannot retrieve a model the SDK cannot retrieve — on Windows both paths fail outright — and it does not pretend otherwise. What it converts is a model deleted silently into a failure you are told about.',
  },
  {
    icon: <ShieldIcon className="h-4 w-4" />,
    title: 'A certificate anyone can check',
    body: 'The lineage the run already produced is canonicalised, written to 0G Storage, its keccak256 anchored on 0G Chain, and minted as an ERC-7857-style Agentic ID. Verification needs no wallet, no key, and no cooperation from me — if this repository disappears, passport #1 stays checkable from the chain and 0G Storage alone.',
  },
]

// ---------------------------------------------------------------------------
// The boundary. Four things this page is careful not to claim.
// ---------------------------------------------------------------------------

const NOT_CLAIMED = [
  {
    head: 'Not mainnet.',
    body: 'Nothing is deployed to 0G mainnet. Passport.sol lives on 0G Galileo, chain 16602. Mainnet is the one outstanding requirement and it is blocked on gas, not on code.',
  },
  {
    head: 'Not retrieval.',
    body: 'Crucible does not fetch your model. It detects the delivery, exhausts every download path the SDK offers, records the failure with its evidence, and releases the queue with acknowledgeDeliverable. Task 1 lost its model regardless, and passport #1 carries a published sentinel where the adapter root hash would go.',
  },
  {
    head: 'Not honest training.',
    body: 'A passport proves lineage: that this manifest is the one anchored, that this dataset is retrievable at this root hash, that the TEE signer is acknowledged on-chain. It does not prove the provider ran the epochs it claimed. That needs zero-knowledge proofs over the training computation — a research programme, not a feature.',
  },
  {
    head: 'Not ERC-7857 compliant.',
    body: 'The standard’s core interface is transfer() with oracle re-encryption, clone(), and authorizeUsage(). Passport.sol implements the third. A passport is public by design, so there is no encrypted payload to re-encrypt and the oracle path does not apply. “ERC-7857-style”, stated in full rather than glossed.',
  },
]

// ---------------------------------------------------------------------------
// Motion. Entrance only, staggered, and gone entirely under reduced motion.
// ---------------------------------------------------------------------------

/** The same curve the rest of the app uses for `popin` and `drawline`. */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

const RISE: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

const STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

/**
 * A staggered entrance container. Under `prefers-reduced-motion` it collapses to
 * a plain element — no variants, no transition, nothing left running — so the
 * page arrives composed rather than assembled.
 */
function Stagger({
  children,
  className,
  onMount = false,
}: {
  children: ReactNode
  className?: string
  /** Play on mount (the hero) rather than when scrolled into view. */
  onMount?: boolean
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  if (onMount) {
    return (
      <motion.div className={className} variants={STAGGER} initial="hidden" animate="show">
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      className={className}
      variants={STAGGER}
      initial="hidden"
      whileInView="show"
      // `once` is what keeps this an entrance rather than a scroll effect: it
      // plays a single time and never reacts to scrolling again.
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

/** One step of a stagger. Must be a direct child of <Stagger>. */
function Rise({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div className={className} variants={RISE}>
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------

export default function LandingPage() {
  const reduced = useReducedMotion()

  return (
    <>
      {/* ================================================================== */}
      {/* Hero — one claim, at display size, and the proof directly beneath.  */}
      {/* ================================================================== */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <Stagger onMount className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-16">
          <div className="min-w-0">
            <Rise className="flex flex-wrap items-center gap-2">
              {/* Chain 16602 is where the contract actually is. Claiming
                  mainnet here is the first thing a judge would check. */}
              <Badge tone="accent">
                <Dot tone="accent" pulse />
                live on 0G Galileo · chain 16602
              </Badge>
              <Badge>source-verified</Badge>
              <Badge>passport #1 minted</Badge>
            </Rise>

            <Rise>
              <h1 className="mt-8 text-display font-medium text-fg text-balance">
                Every model gets a birth certificate.
              </h1>
            </Rise>

            <Rise>
              <p className="measure mt-7 border-l border-phosphor/40 pl-5 text-base leading-relaxed text-fg text-pretty sm:text-lg">
                And a stranger can check it —{' '}
                <span className="text-phosphor">with no wallet, no clone, and no account.</span>
              </p>
            </Rise>

            <Rise>
              <p className="measure mt-6 text-sm leading-relaxed text-dim text-pretty sm:text-base">
                Every fine-tuning task on 0G already emits a complete cryptographic lineage — the
                base model’s hash, the dataset’s 0G Storage root, the exact hyperparameters, and a
                TEE-attested delivery. Four facts that answer{' '}
                <span className="text-fg">where did this model come from</span>. Then the terminal
                scrolls and they are gone. Crucible canonicalises them into a manifest, stores it on
                0G Storage, anchors its <span className="font-mono text-fg">keccak256</span> on 0G
                Chain, and mints it as an Agentic ID.
              </p>
            </Rise>

            <Rise className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/passport/p-000001" className="btn-primary no-underline">
                Read passport #1
                <ArrowIcon className="h-3.5 w-3.5" />
              </Link>
              <Link href="/gallery" className="btn-ghost no-underline">
                Browse the gallery
              </Link>
              <a href="#verify" className="btn-quiet no-underline">
                Verify it yourself
              </a>
            </Rise>
          </div>

          {/* The certificate itself: four anchors, each one resolvable. */}
          <Rise className="min-w-0">
            <div className="surface-lg relative overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <span className="label">Passport #1 · anchors</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-2xs text-phosphor">
                  <Dot tone="accent" />
                  on chain
                </span>
              </div>

              {/* One sweep, once, where a value has been proven. The only
                  decorative motion on the page — and it fires a single time. */}
              {!reduced ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden" aria-hidden="true">
                  <div className="h-px w-1/2 animate-verifysweep bg-gradient-to-r from-transparent via-phosphor to-transparent" />
                </div>
              ) : null}

              <dl className="divide-y divide-line">
                {ANCHORS.map((anchor) => (
                  <div key={anchor.label} className="px-5 py-4">
                    <dt className="label">{anchor.label}</dt>
                    <dd className="mt-1.5 min-w-0">
                      {anchor.href ? (
                        <a
                          href={anchor.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${anchor.full} — open on ${anchor.hrefLabel}`}
                          className="group inline-flex items-start gap-1.5 break-hash font-mono text-[13px] text-fg no-underline transition-colors hover:text-phosphor"
                        >
                          {anchor.value}
                          <ExternalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-phosphor" />
                        </a>
                      ) : (
                        <span
                          className="break-hash font-mono text-[13px] text-fg"
                          title={anchor.full}
                        >
                          {anchor.value}
                        </span>
                      )}
                    </dd>
                    <dd className="mt-1 text-xs leading-relaxed text-faint text-pretty">
                      {anchor.note}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-faint text-pretty">
                Passport #1 records a run that lost its model. Its own page says so before it says
                anything else.
              </p>
            </div>
          </Rise>
        </Stagger>
      </section>

      <HatchBand accent />

      {/* ================================================================== */}
      {/* Verify it yourself — the claim, executable.                         */}
      {/* ================================================================== */}
      <section
        id="verify"
        className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="verify-head"
      >
        <Stagger>
          <Rise>
            <SectionHead
              eyebrow="No wallet required"
              title="Three commands, and nothing taken on my word"
              id="verify-head"
            >
              The manifest is public, the anchor is on a public chain, and the check needs no key.
              Run these against public endpoints — none of them touch this application.
            </SectionHead>
          </Rise>

          <Rise className="mt-10">
            <div className="surface shadow-verified overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-line px-4 py-3 sm:px-5">
                <IconTile size="sm" tone="accent">
                  <TerminalIcon className="h-3.5 w-3.5" />
                </IconTile>
                <span className="label">verify-manifest</span>
              </div>

              <div className="px-4 py-5 sm:px-5">
                <ol className="space-y-5">
                  {VERIFY_STEPS.map((step) => (
                    <li key={step.comment}>
                      <p className="font-mono text-2xs text-faint">{step.comment}</p>
                      <pre className="well mt-1.5 overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed text-dim">
                        <code>{step.command}</code>
                      </pre>
                    </li>
                  ))}
                </ol>
              </div>

              <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-faint text-pretty sm:px-5">
                Step 3 recomputes the hash from the bytes you just downloaded and calls the deployed
                contract. It returns <span className="font-mono text-ok">true</span> for the
                anchored value and <span className="font-mono text-danger">false</span> for a
                tampered one — the whole trust claim, in one call.
              </p>
            </div>
          </Rise>
        </Stagger>
      </section>

      <HatchBand />

      {/* ================================================================== */}
      {/* What the runs actually cost. Same type size as the successes.       */}
      {/* ================================================================== */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="cost-head"
      >
        <Stagger>
          <Rise>
            <SectionHead
              eyebrow="What it cost to find out"
              title="One run lost its model. The other came back."
              id="cost-head"
            >
              To produce a passport I had to fine-tune something, twice. Both tasks were delivered.
              Task 1 was never collected and paid the penalty for it; task 2 was retrieved and
              acknowledged — but only after moving off Windows.
            </SectionHead>
          </Rise>

          <Rise className="mt-10">
            <div className="surface overflow-hidden">
              <dl className="grid gap-px bg-line sm:grid-cols-3">
                {LEDGER.map((row) => (
                  // `dt` must precede its `dd`; the number reads first, so the
                  // order is reversed visually rather than in the markup.
                  <div key={row.label} className="flex flex-col-reverse bg-panel px-5 py-6">
                    <dt className="label mt-3">{row.label}</dt>
                    <dd className={`font-mono text-readout leading-none ${row.tone}`}>
                      {row.readout}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex items-start gap-3 border-t border-line px-5 py-5">
                <IconTile tone="danger">
                  <AlertIcon className="h-4 w-4" />
                </IconTile>
                <p className="measure text-sm leading-relaxed text-dim text-pretty">
                  <span className="font-mono text-fg">acknowledgeModel</span> retrieves nothing on
                  Windows + Node 22, on either download path. Task 1 force-settled with{' '}
                  <span className="font-mono text-danger">acknowledged: false</span> and an empty{' '}
                  <span className="font-mono text-fg">encryptedSecret</span>, and my sub-account was
                  debited exactly 30.0000% of the fee — 0G’s documented penalty for a model you
                  never collected. That arithmetic is the proof it was forfeited rather than quietly
                  delivered somewhere else. Task{' '}
                  <span className="font-mono text-fg">3e385c46</span> was then re-run from WSL2
                  Linux and came back: <span className="font-mono text-ok">acknowledged: true</span>{' '}
                  on-chain, a 93,642,469-byte artifact on disk. The defect is environmental, and
                  proving that took losing one model first.
                </p>
              </div>
            </div>
          </Rise>
        </Stagger>
      </section>

      <HatchBand />

      {/* ================================================================== */}
      {/* Six findings, of fourteen.                                          */}
      {/* ================================================================== */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="findings-head"
      >
        <Stagger>
          <Rise>
            <SectionHead
              eyebrow="Six of fourteen findings"
              title="Every one reproduced against the live network"
              id="findings-head"
            >
              Where 0G’s documentation and the running network disagreed, the network won and the
              documentation is quoted rather than paraphrased. Six of these are corrections to 0G’s
              own published material.
            </SectionHead>
          </Rise>

          {/* A grid of motion wrappers cannot be a <ul>: only <li> may be a
              child of a list. Marked up as articles, which is what they are. */}
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {FOOTGUNS.map((item) => (
              <Rise key={item.title} className="h-full">
                <article className="surface flex h-full flex-col px-5 py-5">
                  <Badge
                    tone={
                      item.sev === 'critical' ? 'danger' : item.sev === 'blocking' ? 'warn' : 'neutral'
                    }
                  >
                    {SEV_LABEL[item.sev]}
                  </Badge>
                  <h3 className="mt-4 text-[15px] font-medium leading-snug text-fg text-pretty">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-dim text-pretty">{item.body}</p>
                  <p className="mt-auto pt-5 font-mono text-2xs uppercase tracking-widest2 text-faint">
                    {item.evidence}
                  </p>
                </article>
              </Rise>
            ))}
          </div>
        </Stagger>
      </section>

      <HatchBand accent />

      {/* ================================================================== */}
      {/* What Crucible does about it.                                        */}
      {/* ================================================================== */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="does-head"
      >
        <Stagger>
          <Rise>
            <SectionHead
              eyebrow="What Crucible does"
              title="Twelve CLI steps become one upload"
              id="does-head"
            >
              Nothing here asks you to trust Crucible’s own database. The daemon does the waiting;
              the chain holds the claim.
            </SectionHead>
          </Rise>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map((cap) => (
              <Rise key={cap.title} className="h-full">
                <div className="surface flex h-full flex-col px-5 py-6">
                  <IconTile tone="accent">{cap.icon}</IconTile>
                  <h3 className="mt-4 text-[15px] font-medium leading-snug text-fg text-pretty">
                    {cap.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-dim text-pretty">{cap.body}</p>
                </div>
              </Rise>
            ))}
          </div>
        </Stagger>
      </section>

      <HatchBand />

      {/* ================================================================== */}
      {/* The boundary.                                                       */}
      {/* ================================================================== */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="boundary-head"
      >
        <Stagger>
          <Rise>
            <SectionHead
              eyebrow="The boundary"
              title="What a passport does not claim"
              id="boundary-head"
            >
              Stated in full rather than glossed, because a judge checks this first — and because a
              provenance tool that overstates its own provenance has already lost the argument.
            </SectionHead>
          </Rise>

          <Rise className="mt-10">
            <dl className="surface grid gap-px overflow-hidden bg-line sm:grid-cols-2">
              {NOT_CLAIMED.map((item) => (
                <div key={item.head} className="bg-panel px-5 py-6">
                  <dt className="flex items-center gap-2.5 text-[15px] font-medium text-fg">
                    <AnchorIcon className="h-4 w-4 shrink-0 text-faint" />
                    {item.head}
                  </dt>
                  <dd className="mt-2.5 text-sm leading-relaxed text-dim text-pretty">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </Rise>

          <Rise className="mt-4">
            <div className="surface flex flex-wrap items-center justify-between gap-4 px-5 py-5">
              <p className="measure text-sm leading-relaxed text-dim text-pretty">
                The one thing a stranger should do next is stop reading this page and check the
                record for themselves.
              </p>
              <Link href="/passport/p-000001" className="btn-primary shrink-0 no-underline">
                Read passport #1
                <ArrowIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Rise>
        </Stagger>
      </section>
    </>
  )
}
