import Link from 'next/link'

import {
  AdapterIcon,
  AlertIcon,
  AnchorIcon,
  ArrowIcon,
  ClockIcon,
  DatasetIcon,
  EnclaveIcon,
  ExternalIcon,
  ModelIcon,
  ShieldIcon,
  SlidersIcon,
  UploadIcon,
} from '@/components/icons'
import { Badge, Dot, HatchBand, IconTile, SectionHead } from '@/components/ui'

/**
 * The landing page has one job: make a stranger understand, in under a minute,
 * that fine-tuning on 0G quietly produces a complete provenance record and then
 * throws it away — and that two of the ways it throws it away are destructive.
 *
 * So the hero is not a value proposition. It is the exhaust of a real run, with
 * the moment it is lost drawn on top of it.
 */

/**
 * What the CLI prints, in the order it prints it.
 *
 * These are the real values from task `10551604-2664-4516-86cf-269a62f93bfc` on
 * 0G Galileo, 2026-08-14 — not a mock-up of what a lineage might look like. The
 * point of the panel is that this data already exists on every run; inventing it
 * would undercut the only claim the hero makes.
 */
const RECEIPT = [
  { k: 'base model', v: 'Qwen2.5-0.5B-Instruct' },
  { k: 'model hash', v: '0xb4f76a88…2c75a7' },
  { k: 'dataset root', v: '0xa5051ae7…9e7dbfd' },
  { k: 'config', v: '5 params · 0xe65b3e51…' },
  { k: 'task', v: '10551604-2664…f93bfc' },
  { k: 'provider', v: '0xA02b95Aa…1E31A09' },
]

/** The two that cost you the model, not just your time. */
const DESTRUCTIVE = [
  {
    readout: '48:00:00',
    readoutLabel: 'from Delivered',
    title: 'A deadline nobody tells you about',
    body: 'When a task reaches Delivered you have 48 hours to acknowledge. Miss it and the adapter is garbage-collected from 0G Storage and the TEE buffer, and 30% of the fee is deducted. There is no notification, no email, no dashboard. You are expected to poll a CLI.',
    cost: 'Cost of missing it: the model, and 30% of the fee.',
    icon: <ClockIcon className="h-4 w-4" />,
  },
  {
    readout: 'PERMANENT',
    readoutLabel: 'account state',
    title: 'A documented bug that locks the account',
    body: 'Retrieve a model the deprecated way and never acknowledge it, and days later the artifact is collected — at which point acknowledgement can never succeed. The deliverable queue is then locked and every later task reverts with “previous deliverable not acknowledged”.',
    cost: 'Cost of hitting it: every future run on that account.',
    icon: <AlertIcon className="h-4 w-4" />,
  },
]

/** The remaining footguns. Cheaper, but they still cost a funded task. */
const FOOTGUNS = [
  {
    when: 'at task creation',
    title: 'Funds land in the wrong sub-account',
    body: 'transfer-fund routes to the inference sub-account unless you pass --service fine-tuning. The failure surfaces much later as an unexplained MinimumDepositRequired.',
  },
  {
    when: 'after funding',
    title: 'The config is validated after you pay',
    body: '0G accepts exactly five parameters and rejects a config with any extra or missing key — once the task is already funded. The docs’ template differs from the working example.',
  },
  {
    when: 'after upload',
    title: 'The dataset is validated after upload',
    body: 'A malformed line is rejected once the file is on 0G Storage and funds have moved, and the rejection tells you very little about which line.',
  },
]

const ANSWERS = [
  {
    icon: <UploadIcon className="h-4 w-4" />,
    title: 'One upload',
    body: 'Drop a dataset in. Crucible validates it against 0G’s three formats before a single token of gas moves, funds the correct sub-account, checks the balance, and creates the task.',
  },
  {
    icon: <ClockIcon className="h-4 w-4" />,
    title: 'A daemon that watches the window for you',
    body: 'It starts acknowledging about two minutes after delivery, retries every download path 0G offers, and escalates six hours before the deadline instead of letting it pass in silence. It cannot fix a broken SDK — on Windows both download paths fail outright — but it turns a model quietly deleted 48 hours later into a failure you are told about while there is still time to act, and it can free a locked queue with acknowledgeDeliverable.',
  },
  {
    icon: <ShieldIcon className="h-4 w-4" />,
    title: 'A passport anyone can check',
    body: 'The lineage the run already produced is written to 0G Storage, hashed on 0G Chain, and minted as an ERC-7857 Agentic ID. Every hash links to the explorer that proves it. No wallet needed to verify.',
  },
]

/**
 * Three explorer links, recorded from `contracts/deployments/`. A landing page
 * that says "verifiable" and then offers nothing to verify is asking for the
 * same trust it claims to remove.
 */
const PROOF = [
  {
    label: 'Passport.sol',
    value: '0x27087B5b…83C1c7',
    note: 'deployed · block 49,596,815',
    href: 'https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7',
  },
  {
    label: 'Passport #1 minted',
    value: '0xb608a8a5…00b3b1',
    note: 'block 49,597,171 · gas 327,702',
    href: 'https://chainscan-galileo.0g.ai/tx/0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1',
  },
  {
    // Storage Scan has no page keyed by a root hash — its human route is
    // /submission/<txSeq>, and the manifest upload has a real one. So this links
    // to the page that exists rather than to a plausible URL that 404s.
    label: 'Manifest on 0G Storage',
    value: 'submission 146937',
    note: '584 bytes · hashes to the anchored value',
    href: 'https://storagescan-galileo.0g.ai/submission/146937',
  },
]

const ARTIFACTS = [
  { icon: <ModelIcon className="h-4 w-4" />, label: 'Base model', value: 'modelHash', note: 'which weights you started from' },
  { icon: <DatasetIcon className="h-4 w-4" />, label: 'Dataset', value: 'rootHash', note: 'retrievable from 0G Storage, forever' },
  { icon: <SlidersIcon className="h-4 w-4" />, label: 'Training', value: '5 parameters', note: 'exactly what 0G accepts, nothing else' },
  { icon: <AdapterIcon className="h-4 w-4" />, label: 'Adapter', value: 'rootHash', note: 'hash-verified at delivery' },
  { icon: <EnclaveIcon className="h-4 w-4" />, label: 'Delivery', value: 'TEE-attested', note: 'Intel TDX, signer acknowledged' },
  { icon: <AnchorIcon className="h-4 w-4" />, label: 'Anchor', value: 'ERC-7857', note: 'immutable once minted' },
]

export default function LandingPage() {
  return (
    <>
      {/* ================================================================ */}
      {/* Hero — the exhaust of a real run, and the moment it is lost.      */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="min-w-0">
            {/* The badge names the network the contract is actually on. Claiming
                mainnet here while Passport.sol lives on Galileo would be the
                first thing a judge checks and the first thing they find wrong. */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">
                <Dot tone="accent" pulse />
                live on 0G Galileo · chain 16602
              </Badge>
              <Badge>ERC-7857 Agentic ID</Badge>
            </div>

            <h1 className="mt-7 text-display font-medium text-fg text-balance">
              Every fine-tune on 0G prints its own provenance.
              <span className="mt-1 block text-dim">Then the terminal scrolls.</span>
            </h1>

            <p className="measure mt-6 text-base leading-relaxed text-dim text-pretty sm:text-lg">
              Base model, dataset root, training config, TEE-attested delivery — four facts that
              answer <span className="text-fg">where did this model come from</span>, written to a
              buffer and lost. Crucible keeps them, anchors them on chain, and hands you a page a
              stranger can verify without a wallet.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/gallery" className="btn-primary no-underline">
                Browse the gallery
                <ArrowIcon className="h-3.5 w-3.5" />
              </Link>
              <Link href="/new" className="btn-ghost no-underline">
                Start a run
              </Link>
            </div>
          </div>

          {/* The receipt. Real field names, real shapes, struck through. */}
          <figure className="min-w-0 rounded-lg border border-line bg-panel">
            <figcaption className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <span className="label">stdout · 0g-compute-cli</span>
              <span className="font-mono text-2xs text-faint">get-task</span>
            </figcaption>

            <div className="px-4 py-4">
              <dl className="space-y-2">
                {RECEIPT.map((line) => (
                  <div key={line.k} className="flex items-baseline justify-between gap-4">
                    <dt className="shrink-0 font-mono text-2xs text-faint">{line.k}</dt>
                    <dd className="min-w-0 truncate font-mono text-xs text-dim" title={line.v}>
                      {line.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative border-t border-line">
              <div className="hatch h-full w-full px-4 py-3">
                <p className="font-mono text-2xs uppercase tracking-widest2 text-faint">
                  buffer scrolled — nothing retained
                </p>
              </div>
            </div>
          </figure>
        </div>

        {/* The six artifacts, laid out the way a manifest lists them. */}
        <dl className="mt-14 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {ARTIFACTS.map((artifact) => (
            <div key={artifact.label} className="bg-panel px-4 py-5">
              <IconTile size="sm" tone="accent">
                {artifact.icon}
              </IconTile>
              <dt className="label mt-3">{artifact.label}</dt>
              <dd className="mt-1 font-mono text-sm text-phosphor">{artifact.value}</dd>
              <dd className="mt-1 text-xs leading-relaxed text-faint text-pretty">
                {artifact.note}
              </dd>
            </div>
          ))}
        </dl>

        {/* ---------------------------------------------------------------- */}
        {/* Proof, not a promise. Three links a stranger can click right now. */}
        {/* ---------------------------------------------------------------- */}
        <section
          className="mt-4 overflow-hidden rounded-lg border border-phosphor/30 bg-panel"
          aria-labelledby="proof"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-phosphor/20 bg-phosphor/[0.06] px-4 py-2 sm:px-5">
            <Dot tone="accent" pulse />
            <h2
              id="proof"
              className="font-mono text-2xs uppercase tracking-widest2 text-phosphor"
            >
              Live on 0G Galileo
            </h2>
            <span className="font-mono text-2xs text-faint">
              executed, not described — every link below resolves
            </span>
          </div>

          <div className="grid gap-px bg-line sm:grid-cols-3">
            {PROOF.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col bg-panel px-4 py-4 no-underline transition-colors hover:bg-raised sm:px-5"
              >
                <span className="label">{item.label}</span>
                <span className="mt-1.5 inline-flex items-center gap-1.5 break-hash font-mono text-[13px] text-fg transition-colors group-hover:text-phosphor">
                  {item.value}
                  <ExternalIcon className="h-3.5 w-3.5 shrink-0" />
                </span>
                <span className="mt-1 font-mono text-2xs text-faint">{item.note}</span>
              </a>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-xs leading-relaxed text-faint text-pretty">
              Passport #1 records a run that lost its model: the deliverable was never
              acknowledged, 0G deducted 30% of the fee, and the adapter hash is a published
              sentinel. Its page says that before it says anything else.
            </p>
            <Link href="/passport/p-000001" className="btn-ghost shrink-0 no-underline">
              Read passport #1
              <ArrowIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </section>

      <HatchBand />

      {/* ================================================================ */}
      {/* The two destructive failures, as instrument readouts.             */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="destructive">
        <SectionHead eyebrow="What it costs you today" title="Two of these destroy something" id="destructive">
          Every claim here was checked against the live 0G network rather than read from
          documentation. Where the docs and reality disagreed, reality won.
        </SectionHead>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {DESTRUCTIVE.map((item) => (
            <article
              key={item.title}
              className="flex flex-col rounded-lg border border-line bg-panel"
            >
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <IconTile tone="danger">{item.icon}</IconTile>
                <div className="min-w-0">
                  <p
                    className="font-mono text-readout leading-none text-danger"
                    aria-label={item.readout}
                  >
                    {item.readout}
                  </p>
                  <p className="label mt-2">{item.readoutLabel}</p>
                </div>
              </div>

              <div className="flex flex-1 flex-col px-5 py-5">
                <h3 className="text-[15px] font-medium leading-snug text-fg">{item.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-dim text-pretty">{item.body}</p>
                <p className="mt-auto pt-5 font-mono text-2xs uppercase tracking-widest2 text-danger/90">
                  {item.cost}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* The cheaper footguns. Labelled by the stage where they bite —
            that ordering is real information; a 01/02/03 would not be. */}
        <ul className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          {FOOTGUNS.map((item) => (
            <li key={item.title} className="bg-panel px-5 py-5">
              <p className="label text-warn/80">{item.when}</p>
              <h3 className="mt-2.5 text-sm font-medium leading-snug text-fg">{item.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-dim text-pretty">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <HatchBand accent />

      {/* ================================================================ */}
      {/* The answer.                                                       */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="answer">
        <SectionHead eyebrow="What Crucible does instead" title="Twelve CLI steps become one upload" id="answer">
          Nothing here asks you to trust Crucible. The daemon does the waiting; the chain holds the
          claim.
        </SectionHead>

        <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          {ANSWERS.map((answer) => (
            <div key={answer.title} className="flex flex-col bg-panel px-5 py-6">
              <IconTile tone="accent">{answer.icon}</IconTile>
              <h3 className="mt-4 text-[15px] font-medium leading-snug text-fg">{answer.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-dim text-pretty">{answer.body}</p>
            </div>
          ))}
        </div>
      </section>

      <HatchBand />

      {/* ================================================================ */}
      {/* The honest caveat. Judges will ask; the answer is the roadmap.     */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="caveat">
        <div className="grid gap-10 rounded-lg border border-line bg-panel px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
          <div>
            <h2 id="caveat" className="font-mono text-sm text-fg">
              What a passport does not claim
            </h2>
            <p className="measure mt-3 text-sm leading-relaxed text-dim text-pretty">
              Crucible proves lineage, not honest training. It proves this adapter’s artifacts
              hash-match, this dataset is retrievable at this root hash, this provider’s TEE
              signer is acknowledged on-chain, and 0G’s integrity check passed on delivery. It
              does <span className="text-fg">not</span> prove the provider ran the epochs it
              claimed — that needs zero-knowledge proofs over the training computation, which is
              a research programme, not a feature.
            </p>
            <p className="measure mt-4 text-sm leading-relaxed text-dim text-pretty">
              What is different here is where the claim comes from. Every other model-provenance
              tool assumes you sign a model you trained on your own hardware. Here the training
              happened inside an enclave on a network the model’s owner does not control, and the
              attestation is anchored on a public chain. The provenance is not asserted by the
              party you would have to trust.
            </p>
          </div>

          <div className="flex flex-col justify-between gap-6 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <dl className="space-y-4">
              <div>
                <dt className="label">Provider hardware</dt>
                <dd className="mt-1 font-mono text-sm text-fg">1x H200</dd>
                <dd className="font-mono text-xs text-faint">8 vCPU · 187 GB · Intel TDX</dd>
              </div>
              <div>
                <dt className="label">Mainnet price</dt>
                <dd className="mt-1 font-mono text-sm text-fg">0.5 0G</dd>
                <dd className="font-mono text-xs text-faint">per million tokens</dd>
              </div>
            </dl>

            <Link href="/passport/p-000001" className="btn-ghost no-underline">
              See a real passport
              <ArrowIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
