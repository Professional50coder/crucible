'use client'

/**
 * The lineage graph — the passport's DAG, drawn.
 *
 * `docs/LINEAGE_GRAPH_SPEC.md` is the contract; `lib/lineage.ts` derives every
 * fact and state from the record. This file only draws what that returns and
 * invents nothing: no colour is chosen here, no state is decided here, and a
 * node with a missing field renders `recorded` or `lost` rather than being
 * hidden to make the picture tidier.
 *
 * Three things it does that a static diagram cannot:
 *
 *   trace     a pulse walks the chain, and on a run that lost its model the
 *             pulse stops dead at the severed edge. The reader watches the
 *             failure instead of being told about it.
 *   isolate   hovering a node dims everything that value never touched.
 *   open      clicking a node opens its typed rows, full hashes and proofs.
 *
 * Nothing loops. Every animation is a one-shot entrance or user-triggered, and
 * reduced motion resolves all of them instantly — the trace control still works,
 * it just arrives at the end state without the journey.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  NODE_ORDER,
  buildLineage,
  layoutLineage,
  traceSchedule,
  type Lineage,
  type LineageNode,
  type LineageState,
  type Orientation,
} from '@/lib/lineage'
import type { PassportRecord } from '@/lib/types'
import { TypedRow, TypedRows } from './Hash'

/** The four states, and the only place their colours are written down. */
const STATE_COLOR: Record<LineageState, string> = {
  verified: '#c8f050',
  recorded: '#a6a8a2',
  provider: '#fbbf24',
  lost: '#f87171',
}

const STATE_WORD: Record<LineageState, string> = {
  verified: 'verified',
  recorded: 'recorded',
  provider: 'provider-reported',
  lost: 'lost',
}

const TONE: Record<LineageState, 'ok' | 'warn' | 'danger' | 'default'> = {
  verified: 'ok',
  recorded: 'default',
  provider: 'warn',
  lost: 'danger',
}

function media(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

export function LineageGraph({
  record,
  compare,
}: {
  record: PassportRecord
  compare?: PassportRecord
}) {
  const [showCompare, setShowCompare] = useState(false)
  const active = showCompare && compare ? compare : record

  const lineage = useMemo(() => buildLineage(active), [active])

  const reduced = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [orientation, setOrientation] = useState<Orientation>('horizontal')

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    let query: MediaQueryList
    try {
      query = window.matchMedia('(max-width: 719px)')
    } catch {
      return
    }
    const apply = () => setOrientation(query.matches ? 'vertical' : 'horizontal')
    apply()
    query.addEventListener?.('change', apply)
    return () => query.removeEventListener?.('change', apply)
  }, [])

  const layout = useMemo(() => layoutLineage(lineage, orientation), [lineage, orientation])
  const steps = useMemo(() => traceSchedule(lineage), [lineage])

  // ---- entrance: rank by rank, once ---------------------------------------
  const [revealedRank, setRevealedRank] = useState(reduced ? lineage.rankCount : -1)

  useEffect(() => {
    if (reduced) {
      setRevealedRank(lineage.rankCount)
      return
    }
    setRevealedRank(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let rank = 1; rank <= lineage.rankCount; rank += 1) {
      timers.push(setTimeout(() => setRevealedRank(rank), rank * 140))
    }
    return () => timers.forEach(clearTimeout)
    // Runs once per orientation-independent mount; the chain assembles itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, lineage.rankCount])

  // ---- the trace ----------------------------------------------------------
  const [stepIndex, setStepIndex] = useState(-1)
  const [tracing, setTracing] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const played = useRef(false)

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  /**
   * How long the finished chain is left standing before the trace runs again.
   *
   * Long on purpose. The end state — every node lit, or the severed edge on a
   * run that lost its model — is the information; the animation is only how a
   * reader gets there. A short pause would keep pulling the eye back to motion
   * it has already understood, so the still frame gets more time than the
   * animation does.
   */
  const LOOP_PAUSE_MS = 7000

  const runTrace = useCallback(
    (loop = false) => {
      clearTimers()
      if (reduced) {
        // Everything still works; it just resolves instantly, and never repeats.
        setStepIndex(steps.length - 1)
        setTracing(false)
        return
      }
      setStepIndex(-1)
      setTracing(true)
      let elapsed = 0
      steps.forEach((step, index) => {
        timers.current.push(setTimeout(() => setStepIndex(index), elapsed))
        elapsed += step.ms
      })
      timers.current.push(setTimeout(() => setTracing(false), elapsed))
      if (loop) {
        timers.current.push(setTimeout(() => runTrace(true), elapsed + LOOP_PAUSE_MS))
      }
    },
    [clearTimers, reduced, steps],
  )

  useEffect(() => () => clearTimers(), [clearTimers])

  /**
   * Autoplay, then repeat on a long cycle.
   *
   * Reduced motion opts out of the loop entirely rather than running a faster
   * one: someone who has asked the operating system for less movement has not
   * asked for the same movement more often. They get the resolved chain and the
   * replay button, which is the whole meaning without any of the motion.
   */
  useEffect(() => {
    if (played.current) return
    played.current = true
    const delay = reduced ? 0 : lineage.rankCount * 140 + 220
    const timer = setTimeout(() => runTrace(!reduced), delay)
    return () => clearTimeout(timer)
  }, [reduced, runTrace, lineage.rankCount])

  /** How far the pulse has travelled, as a set of lit node and edge ids. */
  const lit = useMemo(() => {
    const nodes = new Set<string>()
    const edges = new Set<string>()
    let halted: string | undefined
    steps.slice(0, stepIndex + 1).forEach((step) => {
      step.ids.forEach((id) => (step.kind === 'node' ? nodes.add(id) : edges.add(id)))
      if (step.halt) halted = step.ids[0]
    })
    const current = stepIndex >= 0 ? steps[stepIndex] : undefined
    return { nodes, edges, halted, current }
  }, [steps, stepIndex])

  // ---- hover + selection ---------------------------------------------------
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const nodeRefs = useRef<Record<string, SVGGElement | null>>({})

  const related = useMemo(() => {
    if (!hovered) return null
    const nodes = new Set<string>([hovered])
    const edges = new Set<string>()
    lineage.edges.forEach((edge) => {
      if (edge.from === hovered || edge.to === hovered) {
        edges.add(edge.id)
        nodes.add(edge.from)
        nodes.add(edge.to)
      }
    })
    return { nodes, edges }
  }, [hovered, lineage.edges])

  const focusNode = useCallback((id: string) => {
    nodeRefs.current[id]?.focus()
  }, [])

  const onNodeKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGGElement>, id: string) => {
      const index = NODE_ORDER.indexOf(id as (typeof NODE_ORDER)[number])
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        focusNode(NODE_ORDER[Math.min(NODE_ORDER.length - 1, index + 1)]!)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        focusNode(NODE_ORDER[Math.max(0, index - 1)]!)
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setSelected((current) => (current === id ? null : id))
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setSelected(null)
      }
    },
    [focusNode],
  )

  const detail = selected ? lineage.nodes.find((node) => node.id === selected) : undefined
  const duration = (ms: number) => (reduced ? 0 : ms)

  return (
    <section
      className="lineage-graph mt-4 overflow-hidden rounded-lg border border-line bg-panel shadow-panel"
      aria-labelledby="lineage-heading"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelected(null)
      }}
    >
      <style>{`
        @media print {
          .lineage-graph .lg-card { fill: #ffffff !important; }
          .lineage-graph text { fill: #101110 !important; }
          .lineage-graph .lg-comet { display: none !important; }
          .lineage-graph .lg-fade { opacity: 1 !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="lineage-heading" className="label text-dim">
          Lineage
        </h2>
        <span className="font-mono text-2xs text-faint">
          {lineage.broken ? 'the chain breaks — see the red node' : 'eight nodes, one chain'}
        </span>

        <div className="no-print ml-auto flex items-center gap-2">
          {compare ? (
            <button
              type="button"
              onClick={() => setShowCompare((value) => !value)}
              className="cursor-pointer rounded border border-line-bright bg-sub px-2.5 py-1 font-mono text-2xs text-dim hover:text-fg"
            >
              {showCompare ? 'show this run' : 'compare with the other run'}
            </button>
          ) : null}
          <button
            type="button"
            // Explicit rather than passing the handler directly: React would
            // hand the click event in as `loop`, which is truthy by accident.
            // A manual replay resumes the cycle, which is what a reader means
            // by pressing it.
            onClick={() => runTrace(!reduced)}
            aria-label="Trace this provenance"
            className="cursor-pointer rounded border border-phosphor/35 bg-phosphor/[0.07] px-2.5 py-1 font-mono text-2xs text-phosphor hover:bg-phosphor/[0.12]"
          >
            {tracing ? 'tracing…' : '▶ trace this provenance'}
          </button>
        </div>
      </div>

      <div className="scroll-x px-3 py-4 sm:px-4">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          role="group"
          aria-label={lineage.summary}
          className="block h-auto w-full"
          style={{ maxHeight: orientation === 'vertical' ? undefined : 360 }}
        >
          <defs>
            <marker
              id="lg-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#383a38" />
            </marker>
          </defs>

          {/* ---- edges ---- */}
          {lineage.edges.map((edge) => {
            const geometry = layout.edges[edge.id]!
            const target = lineage.nodes.find((node) => node.id === edge.to)!
            const drawn = revealedRank >= target.rank
            const dimmed = related ? (related.edges.has(edge.id) ? false : true) : false
            const color = STATE_COLOR[edge.state]
            const traced = lit.edges.has(edge.id)
            const isCurrent = lit.current?.kind === 'edge' && lit.current.ids.includes(edge.id)

            return (
              <g key={edge.id} data-edge={edge.id} data-state={edge.state}>
                <path
                  d={geometry.d}
                  pathLength={100}
                  fill="none"
                  stroke={traced ? color : '#383a38'}
                  strokeWidth={edge.severed ? 1.6 : 1.2}
                  strokeDasharray={
                    edge.severed && traced ? '3 4' : edge.afterBreak ? '2 5' : '100'
                  }
                  strokeDashoffset={drawn || edge.severed ? 0 : 100}
                  markerEnd={edge.severed ? undefined : 'url(#lg-arrow)'}
                  className="lg-fade"
                  style={{
                    opacity: dimmed ? 0.28 : traced ? 0.95 : 0.7,
                    transition: `stroke-dashoffset ${duration(420)}ms ease-out, opacity ${duration(
                      220,
                    )}ms ease, stroke ${duration(360)}ms ease`,
                  }}
                />

                {/* The travelling pulse. Stops partway on a severed edge. */}
                <path
                  className="lg-comet"
                  aria-hidden="true"
                  d={geometry.d}
                  pathLength={100}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeDasharray="12 100"
                  strokeDashoffset={traced ? (edge.severed ? -55 : -100) : 12}
                  style={{
                    opacity: traced ? (isCurrent ? 1 : 0) : 0,
                    transition: `stroke-dashoffset ${duration(
                      lit.current?.ms ?? 320,
                    )}ms linear, opacity ${duration(240)}ms ease`,
                  }}
                />
              </g>
            )
          })}

          {/* ---- nodes ---- */}
          {lineage.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              box={layout.nodes[node.id]!}
              revealed={revealedRank >= node.rank}
              traced={lit.nodes.has(node.id)}
              dimmed={related ? !related.nodes.has(node.id) : false}
              selected={selected === node.id}
              duration={duration}
              refFor={(element) => {
                nodeRefs.current[node.id] = element
              }}
              onHover={setHovered}
              onSelect={(id) => setSelected((current) => (current === id ? null : id))}
              onKeyDown={onNodeKeyDown}
            />
          ))}
        </svg>
      </div>

      {detail ? <Detail key={detail.id} node={detail} onClose={() => setSelected(null)} /> : null}
    </section>
  )
}

function NodeCard({
  node,
  box,
  revealed,
  traced,
  dimmed,
  selected,
  duration,
  refFor,
  onHover,
  onSelect,
  onKeyDown,
}: {
  node: LineageNode
  box: { x: number; y: number; w: number; h: number }
  revealed: boolean
  traced: boolean
  dimmed: boolean
  selected: boolean
  duration: (ms: number) => number
  refFor: (element: SVGGElement | null) => void
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onKeyDown: (event: React.KeyboardEvent<SVGGElement>, id: string) => void
}) {
  const color = STATE_COLOR[node.state]
  const pad = 11

  return (
    <g
      ref={refFor}
      role="button"
      tabIndex={0}
      data-node={node.id}
      data-state={node.state}
      data-traced={traced ? 'true' : 'false'}
      aria-label={`${node.title} — ${node.headline} — ${STATE_WORD[node.state]}`}
      aria-pressed={selected}
      className="lg-fade cursor-pointer"
      style={{
        opacity: !revealed ? 0 : dimmed ? 0.45 : 1,
        transition: `opacity ${duration(260)}ms ease`,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => onKeyDown(event, node.id)}
    >
      <rect
        className="lg-card"
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={8}
        fill="#191a1a"
        stroke={traced || selected ? color : '#383a38'}
        strokeWidth={selected ? 1.8 : 1}
        style={{ transition: `stroke ${duration(360)}ms ease, stroke-width ${duration(160)}ms ease` }}
      />

      <circle cx={box.x + box.w - pad} cy={box.y + pad + 1} r={3.2} fill={color} />

      <text
        x={box.x + pad}
        y={box.y + pad + 6}
        fill="#82847e"
        fontSize={7.5}
        letterSpacing={1.6}
        style={{ textTransform: 'uppercase' }}
      >
        {node.kind.toUpperCase()}
      </text>

      <text x={box.x + pad} y={box.y + pad + 25} fill="#ecedea" fontSize={12}>
        {node.title}
      </text>

      <text x={box.x + pad} y={box.y + pad + 42} fill={color} fontSize={10} fontFamily="monospace">
        {clip(node.headline, box.w > 200 ? 44 : 20)}
      </text>

      <text x={box.x + pad} y={box.y + pad + 57} fill="#82847e" fontSize={7.5}>
        {clip(node.subtitle, box.w > 200 ? 60 : 27)}
      </text>

      {node.magnitude ? (
        <>
          <rect
            x={box.x + pad}
            y={box.y + box.h - 12}
            width={box.w - pad * 2}
            height={2.5}
            rx={1.25}
            fill="#282a29"
          />
          <rect
            x={box.x + pad}
            y={box.y + box.h - 12}
            width={(box.w - pad * 2) * node.magnitude.weight}
            height={2.5}
            rx={1.25}
            fill={color}
            opacity={0.75}
          />
        </>
      ) : null}
    </g>
  )
}

function Detail({ node, onClose }: { node: LineageNode; onClose: () => void }) {
  return (
    <div className="animate-fadeup border-t border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-xs"
          style={{ color: STATE_COLOR[node.state] }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: STATE_COLOR[node.state] }}
          />
          {node.title}
        </span>
        <span className="font-mono text-2xs uppercase tracking-widest2 text-faint">
          {STATE_WORD[node.state]}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="no-print ml-auto cursor-pointer rounded border border-line px-2 py-0.5 font-mono text-2xs text-faint hover:text-fg"
        >
          close
        </button>
      </div>

      <div className="px-4 pb-4 sm:px-5">
        <p className="measure text-sm leading-relaxed text-dim text-pretty">{node.verdict}</p>
        <p className="measure mt-2 text-xs leading-relaxed text-faint text-pretty">
          Check it yourself: {node.checkedBy}
        </p>
      </div>

      <TypedRows>
        {node.facts.map((fact) => (
          <TypedRow
            key={fact.name}
            type={fact.type}
            name={fact.name}
            value={fact.value}
            href={fact.href}
            hrefLabel={fact.hrefLabel}
            note={fact.note}
            hash={fact.hash}
            unverifiable={fact.unverifiable}
            tone={fact.state ? TONE[fact.state] : 'default'}
          />
        ))}
      </TypedRows>
    </div>
  )
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export default LineageGraph
