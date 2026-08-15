import { describe, expect, it } from 'vitest'

import {
  buildLineage,
  edgeId,
  layoutLineage,
  magnitudeWeight,
  NODE_ORDER,
  safeUrl,
  traceDuration,
  traceSchedule,
  type LineageNodeId,
} from './lineage'
import { realPassport } from './mock/fixtures'
import type { PassportRecord } from './types'

/**
 * Passport #2 — the run that kept its model.
 *
 * Same provider, same base model, same dataset, same config as #1; the one
 * variable is that its adapter was retrieved (from WSL2, via the 0g-storage
 * path, after both paths failed on Windows) and acknowledged on chain. Built
 * from #1 by overriding exactly the fields that differ, so a test that shows the
 * two graphs diverging is showing that one variable and nothing else.
 */
function run2(): PassportRecord {
  const record = structuredClone(realPassport()) as PassportRecord
  record.id = 'p-000002'
  record.name = 'sentiment-smoke-02'
  record.manifest.task.id = '3e385c46-f5dc-4e93-b713-63ab7a987ae3'
  record.manifest.adapter = {
    rootHash: '0x40a5f256ff464106f6be38ef146614bd78d5ddfe07af16b156d3efcddb561b4d',
    sizeBytes: 93_642_469,
  }
  delete record.adapterOrigin
  delete record.caveat
  record.settlement = { acknowledged: true }
  record.mint.tokenId = '2'
  record.mint.txHash =
    '0x60094f63813827391266d7f77c02649342b435d86d297964d499d2deae420324'
  record.mint.blockNumber = 49_612_106
  return record
}

function stateOf(record: PassportRecord, id: LineageNodeId) {
  const node = buildLineage(record).nodes.find((n) => n.id === id)
  expect(node, `node ${id} must exist`).toBeDefined()
  return node!.state
}

describe('buildLineage — shape', () => {
  it('draws the eight nodes of the spec in rank order', () => {
    const lineage = buildLineage(realPassport())
    expect(lineage.nodes.map((n) => n.id)).toEqual(NODE_ORDER)
    expect(lineage.nodes.map((n) => n.rank)).toEqual([0, 0, 0, 1, 2, 3, 4, 5])
  })

  it('is a DAG of seven edges: three inputs converge, then a chain', () => {
    const lineage = buildLineage(realPassport())
    expect(lineage.edges.map((e) => e.id)).toEqual([
      'base-task',
      'dataset-task',
      'config-task',
      'task-adapter',
      'adapter-manifest',
      'manifest-anchor',
      'anchor-token',
    ])
  })

  it('renders the identical graph for both passports', () => {
    const one = buildLineage(realPassport())
    const two = buildLineage(run2())
    expect(two.nodes.map((n) => n.id)).toEqual(one.nodes.map((n) => n.id))
    expect(two.nodes.map((n) => n.rank)).toEqual(one.nodes.map((n) => n.rank))
    expect(two.edges.map((e) => e.id)).toEqual(one.edges.map((e) => e.id))
  })
})

describe('node state — derived, never hardcoded', () => {
  it('passport #1: the adapter is lost, because its model is gone', () => {
    expect(stateOf(realPassport(), 'adapter')).toBe('lost')
  })

  it('passport #2: the adapter is verified, because it was acknowledged on chain', () => {
    expect(stateOf(run2(), 'adapter')).toBe('verified')
  })

  it('the adapter node is the only node that differs between the two', () => {
    const one = buildLineage(realPassport())
    const two = buildLineage(run2())
    const differing = one.nodes
      .filter((node, i) => node.state !== two.nodes[i]!.state)
      .map((node) => node.id)
    expect(differing).toEqual(['adapter'])
  })

  it('follows the record: a sentinel adapter is lost even before settlement is read', () => {
    const record = run2()
    record.manifest.adapter = { rootHash: realPassport().manifest.adapter.rootHash }
    record.adapterOrigin = { kind: 'sentinel', sentinelPreimage: 'x' }
    expect(stateOf(record, 'adapter')).toBe('lost')
  })

  it('an unacknowledged deliverable is lost even with a real-looking root hash', () => {
    const record = run2()
    record.settlement = { acknowledged: false }
    expect(stateOf(record, 'adapter')).toBe('lost')
  })

  it('an adapter with no settlement to check is recorded, not verified', () => {
    const record = run2()
    delete record.settlement
    expect(stateOf(record, 'adapter')).toBe('recorded')
  })

  it('the task node is provider on both — 0G progress is off-chain and advisory', () => {
    expect(stateOf(realPassport(), 'task')).toBe('provider')
    expect(stateOf(run2(), 'task')).toBe('provider')
  })

  it('the anchor is verified only when the recomputed hash matches', () => {
    expect(stateOf(realPassport(), 'anchor')).toBe('verified')

    const tampered = realPassport()
    tampered.anchoredManifest = { ...tampered.anchoredManifest, tampered: true }
    expect(stateOf(tampered, 'anchor')).toBe('lost')
  })

  it('a demo record anchors nothing, so its anchor is recorded rather than verified', () => {
    const demo = realPassport()
    demo.provenance = 'demo'
    expect(stateOf(demo, 'anchor')).toBe('recorded')
    expect(buildLineage(demo).integrity).toBe('demo')
  })

  it('the config is verified because its hash is recomputed here and compared', () => {
    expect(stateOf(realPassport(), 'config')).toBe('verified')

    const wrong = realPassport()
    wrong.mint.configHash =
      '0x0000000000000000000000000000000000000000000000000000000000000001'
    expect(stateOf(wrong, 'config')).toBe('lost')

    const unanchored = realPassport()
    delete unanchored.mint.configHash
    expect(stateOf(unanchored, 'config')).toBe('recorded')
  })

  it('inputs nobody re-checked are recorded, not quietly promoted to verified', () => {
    expect(stateOf(realPassport(), 'base')).toBe('recorded')
    expect(stateOf(realPassport(), 'dataset')).toBe('recorded')
  })

  it('the token is verified once minted on chain, recorded while pending', () => {
    expect(stateOf(realPassport(), 'token')).toBe('verified')

    const pending = realPassport()
    pending.mint.status = 'pending'
    expect(stateOf(pending, 'token')).toBe('recorded')
  })

  it('the attestation is recorded, because verifyService() is never called', () => {
    const task = buildLineage(realPassport()).nodes.find((n) => n.id === 'task')!
    const attestation = task.facts.find((f) => f.name === 'tee.attestationVerified')!
    expect(attestation.value).toBe('false')
    expect(attestation.state).toBe('recorded')
    expect(attestation.state).not.toBe('verified')
  })
})

describe('edges carry the state of what arrives', () => {
  it('severs the edge into the lost adapter on passport #1', () => {
    const lineage = buildLineage(realPassport())
    const broken = lineage.edges.find((e) => e.id === edgeId('task', 'adapter'))!
    expect(broken.severed).toBe(true)
    expect(broken.state).toBe('lost')
    expect(lineage.broken).toBe(true)
    expect(lineage.brokenAt).toBe('adapter')
  })

  it('marks everything downstream of the break as downstream of it', () => {
    const lineage = buildLineage(realPassport())
    const after = lineage.edges.find((e) => e.id === edgeId('adapter', 'manifest'))!
    expect(after.afterBreak).toBe(true)
    const before = lineage.edges.find((e) => e.id === edgeId('base', 'task'))!
    expect(before.afterBreak).toBe(false)
  })

  it('severs nothing on passport #2 — the chain completes', () => {
    const lineage = buildLineage(run2())
    expect(lineage.edges.some((e) => e.severed)).toBe(false)
    expect(lineage.broken).toBe(false)
    expect(lineage.brokenAt).toBeUndefined()
  })
})

describe('facts', () => {
  it('carries the sentinel preimage on #1 so a reader can reproduce it', () => {
    const adapter = buildLineage(realPassport()).nodes.find((n) => n.id === 'adapter')!
    const preimage = adapter.facts.find((f) => f.name === 'sentinel preimage')!
    expect(preimage.value).toBe(
      'crucible:adapter-not-retrieved:10551604-2664-4516-86cf-269a62f93bfc',
    )
  })

  it('surfaces the 30% penalty on #1, computed from the two amounts', () => {
    const adapter = buildLineage(realPassport()).nodes.find((n) => n.id === 'adapter')!
    const penalty = adapter.facts.find((f) => f.name === 'penalty deducted')!
    expect(penalty.note).toContain('30.0000%')
  })

  it('never links a sentinel to storage — there is nothing at it', () => {
    const adapter = buildLineage(realPassport()).nodes.find((n) => n.id === 'adapter')!
    const root = adapter.facts.find((f) => f.name.startsWith('adapter.rootHash'))!
    expect(root.href).toBeUndefined()
  })

  it('links a real adapter root hash on #2', () => {
    const adapter = buildLineage(run2()).nodes.find((n) => n.id === 'adapter')!
    const root = adapter.facts.find((f) => f.name === 'adapter.rootHash')!
    expect(root.href).toMatch(/^https:\/\/storagescan-galileo\.0g\.ai\//)
  })

  it('draws no explorer links at all on a demo record', () => {
    const demo = realPassport()
    demo.provenance = 'demo'
    const hrefs = buildLineage(demo)
      .nodes.flatMap((n) => n.facts)
      .map((f) => f.href)
      .filter((href): href is string => href !== undefined)
    // The provider, TEE signer and tokenizer are genuine on every record; the
    // storage and transaction links are not, and must not be drawn.
    expect(hrefs.every((href) => !href.includes('storagescan'))).toBe(true)
    expect(hrefs.every((href) => !href.includes('/tx/'))).toBe(true)
  })
})

describe('safeUrl', () => {
  it('passes plain https urls', () => {
    expect(safeUrl('https://chainscan-galileo.0g.ai/tx/0xabc')).toBe(
      'https://chainscan-galileo.0g.ai/tx/0xabc',
    )
  })

  it('rejects anything else', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('http://example.com')).toBeUndefined()
    expect(safeUrl('https://x.test/" onerror="alert(1)')).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
  })
})

describe('magnitude', () => {
  it('keeps real quantities in order across seven orders of magnitude', () => {
    const examples = magnitudeWeight(61)
    const manifestBytes = magnitudeWeight(584)
    const adapterBytes = magnitudeWeight(93_642_469)
    expect(examples).toBeLessThan(manifestBytes)
    expect(manifestBytes).toBeLessThan(adapterBytes)
    expect(adapterBytes).toBeLessThanOrEqual(1)
    expect(magnitudeWeight(0)).toBe(0)
  })

  it('encodes the real numbers off the record, and invents none', () => {
    const two = buildLineage(run2())
    expect(two.nodes.find((n) => n.id === 'adapter')!.magnitude!.value).toBe(93_642_469)
    expect(two.nodes.find((n) => n.id === 'dataset')!.magnitude!.value).toBe(61)

    // #1 has no adapter, so it has no size, so it gets no bar.
    const one = buildLineage(realPassport())
    expect(one.nodes.find((n) => n.id === 'adapter')!.magnitude).toBeUndefined()
  })
})

describe('trace', () => {
  it('runs the whole chain on #2, in 2.5–3.5 seconds', () => {
    const steps = traceSchedule(buildLineage(run2()))
    expect(steps.at(-1)).toMatchObject({ kind: 'node', ids: ['token'] })
    expect(steps.some((s) => s.halt)).toBe(false)
    const total = traceDuration(steps)
    expect(total).toBeGreaterThanOrEqual(2500)
    expect(total).toBeLessThanOrEqual(3500)
  })

  it('halts at the severed edge on #1 — the chain visibly does not complete', () => {
    const steps = traceSchedule(buildLineage(realPassport()))
    const halting = steps.filter((s) => s.halt)
    expect(halting).toHaveLength(1)
    expect(halting[0]!.ids).toEqual(['task-adapter'])
    expect(steps.at(-1)).toMatchObject({ kind: 'node', ids: ['adapter'] })
    expect(steps.some((s) => s.ids.includes('token'))).toBe(false)
    expect(traceDuration(steps)).toBeLessThan(traceDuration(traceSchedule(buildLineage(run2()))))
  })

  it('converges the three inputs on the task in one step', () => {
    const steps = traceSchedule(buildLineage(run2()))
    const converge = steps.find((s) => s.kind === 'edge')!
    expect(converge.ids).toEqual(['base-task', 'dataset-task', 'config-task'])
  })
})

describe('layout — fixed ranks, no simulation', () => {
  it('is deterministic: the same record lays out identically every time', () => {
    const lineage = buildLineage(realPassport())
    expect(layoutLineage(lineage, 'horizontal')).toEqual(
      layoutLineage(lineage, 'horizontal'),
    )
  })

  it('puts rank 0 in one column and advances x with rank', () => {
    const layout = layoutLineage(buildLineage(realPassport()), 'horizontal')
    expect(layout.nodes.base!.x).toBe(layout.nodes.dataset!.x)
    expect(layout.nodes.base!.y).toBeLessThan(layout.nodes.dataset!.y)
    expect(layout.nodes.task!.x).toBeGreaterThan(layout.nodes.base!.x)
    expect(layout.nodes.token!.x).toBeGreaterThan(layout.nodes.anchor!.x)
    expect(layout.orientation).toBe('horizontal')
  })

  it('becomes a vertical chain, same nodes, same states', () => {
    const lineage = buildLineage(realPassport())
    const layout = layoutLineage(lineage, 'vertical')
    expect(Object.keys(layout.nodes)).toHaveLength(lineage.nodes.length)
    expect(layout.nodes.base!.x).toBe(layout.nodes.token!.x)
    expect(layout.nodes.token!.y).toBeGreaterThan(layout.nodes.base!.y)
    expect(layout.height).toBeGreaterThan(layout.width)
  })

  it('gives every edge a path in both orientations', () => {
    const lineage = buildLineage(realPassport())
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const layout = layoutLineage(lineage, orientation)
      for (const edge of lineage.edges) {
        expect(layout.edges[edge.id]!.d).toMatch(/^M /)
      }
    }
  })
})
