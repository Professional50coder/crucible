import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Orchestrator } from '../src/orchestrator.js'
import { createApi, type ApiHandle } from '../src/api.js'
import { ManualClock, HOUR } from '../src/clock.js'
import { FakeBroker, TESTNET_PROVIDER } from './fakes.js'

let clock: ManualClock
let dir: string
let broker: FakeBroker
let orch: Orchestrator
let api: ApiHandle
let base: string

const CONFIG = {
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
  learning_rate: 0.00002,
  max_steps: -1,
}

beforeEach(async () => {
  clock = new ManualClock(Date.UTC(2026, 7, 14, 12, 0, 0))
  dir = mkdtempSync(join(tmpdir(), 'crucible-api-'))
  broker = new FakeBroker()
  orch = new Orchestrator({ broker, clock, dataDir: dir })
  api = createApi({ orchestrator: orch, passportsDir: join(dir, 'passports'), version: '0.1.0' })
  const { port } = await api.listen(0)
  base = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  await api?.close()
  orch?.close()
  rmSync(dir, { recursive: true, force: true })
})

async function post(path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { res, json: await res.json().catch(() => null) }
}

async function get(path: string) {
  const res = await fetch(`${base}${path}`)
  return { res, json: await res.json().catch(() => null) }
}

const validBody = {
  network: 'testnet',
  provider: TESTNET_PROVIDER,
  model: 'Qwen2.5-0.5B-Instruct',
  datasetRootHash: '0xroot',
  config: CONFIG,
}

describe('GET /health', () => {
  it('reports ok and a version', async () => {
    const { res, json } = await get('/health')
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, version: '0.1.0' })
  })
})

describe('POST /jobs', () => {
  it('creates a job and returns the documented wire shape', async () => {
    const { res, json } = await post('/jobs', validBody)
    expect(res.status).toBe(201)
    expect(json.id).toMatch(/\S/)
    expect(json.state).toBe('Init')
    expect(json.network).toBe('testnet')
    expect(json.provider).toBe(TESTNET_PROVIDER)
    expect(json.taskId).toBeNull()
    expect(json.queued).toBe(false)
    expect(json.createdAt).toBe('2026-08-14T12:00:00.000Z')
    expect(json.datasetRootHash).toBe('0xroot')
    expect(json.acknowledgeScheduledFor).toBeNull()
  })

  it('accepts datasetPath instead of datasetRootHash', async () => {
    const p = join(dir, 'train.jsonl')
    writeFileSync(p, '{"text":"x"}\n')
    const { res, json } = await post('/jobs', { ...validBody, datasetRootHash: undefined, datasetPath: p })
    expect(res.status).toBe(201)
    expect(json.datasetRootHash).toBeNull()
  })

  it('rejects a body with neither dataset reference', async () => {
    const { res, json } = await post('/jobs', { ...validBody, datasetRootHash: undefined })
    expect(res.status).toBe(400)
    expect(json.error).toMatch(/dataset/i)
    expect(json.code).toBeDefined()
  })

  it('rejects an unknown network', async () => {
    const { res, json } = await post('/jobs', { ...validBody, network: 'devnet' })
    expect(res.status).toBe(400)
    expect(json.error).toMatch(/network/i)
  })

  it('rejects a missing provider', async () => {
    const { res, json } = await post('/jobs', { ...validBody, provider: undefined })
    expect(res.status).toBe(400)
    expect(json.error).toMatch(/provider/i)
  })

  it('rejects malformed JSON with 400, not a crash', async () => {
    const res = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/json/i)
  })
})

describe('GET /jobs and /jobs/:id', () => {
  it('lists jobs newest first', async () => {
    const a = (await post('/jobs', validBody)).json
    clock.advance(1000)
    const b = (await post('/jobs', validBody)).json
    const { json } = await get('/jobs')
    expect(json.map((j: { id: string }) => j.id)).toEqual([b.id, a.id])
  })

  it('gets one job', async () => {
    const a = (await post('/jobs', validBody)).json
    const { res, json } = await get(`/jobs/${a.id}`)
    expect(res.status).toBe(200)
    expect(json.id).toBe(a.id)
  })

  it('404s an unknown job with a structured error', async () => {
    const { res, json } = await get('/jobs/does-not-exist')
    expect(res.status).toBe(404)
    expect(json.error).toMatch(/not found/i)
    expect(json.code).toBe('job_not_found')
  })

  it('surfaces an occupied provider as queued, never as an error', async () => {
    const a = (await post('/jobs', validBody)).json
    broker.createTaskErrors.push(new Error('provider is occupied'))
    await orch.tick()

    const { res, json } = await get(`/jobs/${a.id}`)
    expect(res.status).toBe(200)
    expect(json.queued).toBe(true)
    expect(json.error).toBeNull()
    expect(json.state).toBe('Init')
  })

  it('exposes acknowledgeScheduledFor once the job is Delivered', async () => {
    const a = (await post('/jobs', validBody)).json
    broker.nextTaskId = 'task-api'
    await orch.tick()
    broker.setTask('task-api', 'Delivered')
    await orch.tick()

    const { json } = await get(`/jobs/${a.id}`)
    expect(json.state).toBe('Delivered')
    expect(json.deliveredAt).not.toBeNull()
    const scheduled = new Date(json.acknowledgeScheduledFor).getTime()
    const delivered = new Date(json.deliveredAt).getTime()
    expect(scheduled - delivered).toBe(HOUR)
    expect(scheduled - delivered).toBeLessThan(48 * HOUR)
  })
})

describe('GET /jobs/:id/logs', () => {
  it('returns the provider training log', async () => {
    const a = (await post('/jobs', validBody)).json
    broker.nextTaskId = 'task-log'
    await orch.tick()
    broker.logs.set('task-log', 'step 10 loss 0.42')

    const { res, json } = await get(`/jobs/${a.id}/logs`)
    expect(res.status).toBe(200)
    expect(json).toEqual({ logs: 'step 10 loss 0.42' })
  })

  it('404s logs for an unknown job', async () => {
    const { res } = await get('/jobs/nope/logs')
    expect(res.status).toBe(404)
  })
})

describe('POST /jobs/:id/unlock', () => {
  it('unlocks a stuck queue and reports ok', async () => {
    const a = (await post('/jobs', validBody)).json
    broker.nextTaskId = 'task-stuck'
    await orch.tick()
    broker.setTask('task-stuck', 'Delivered')

    const { res, json } = await post(`/jobs/${a.id}/unlock`)
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json).toHaveProperty('txHash')
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(1)
    expect(broker.usedDeprecatedPath()).toBe(false)
  })

  it('404s unlocking an unknown job', async () => {
    const { res, json } = await post('/jobs/nope/unlock')
    expect(res.status).toBe(404)
    expect(json.error).toMatch(/not found/i)
  })

  it('reports a genuine unlock failure with a 502, not a fake success', async () => {
    const a = (await post('/jobs', validBody)).json
    broker.nextTaskId = 'task-x'
    await orch.tick()
    broker.setTask('task-x', 'Delivered')
    broker.acknowledgeDeliverableErrors.push(new Error('insufficient funds for gas'))

    const { res, json } = await post(`/jobs/${a.id}/unlock`)
    expect(res.status).toBe(502)
    expect(json.error).toMatch(/insufficient funds/)
  })
})

/**
 * The provider-scoped half of the recovery API. Every test here deliberately
 * creates NO local job: an account that arrived with the queue already locked
 * has no job record to address, which is exactly why /jobs/:id/unlock cannot
 * reach it.
 */
describe('GET /providers/:provider/lock', () => {
  it('reports an open queue when no deliverable is sitting unacknowledged', async () => {
    const { res, json } = await get(`/providers/${TESTNET_PROVIDER}/lock`)
    expect(res.status).toBe(200)
    expect(json.locked).toBe(false)
    expect(orch.listJobs()).toHaveLength(0)
  })

  it('reports the locked queue and the task holding it, with no local job record', async () => {
    broker.setTask('task-orphan', 'Delivered')

    const { res, json } = await get(`/providers/${TESTNET_PROVIDER}/lock`)
    expect(res.status).toBe(200)
    expect(json.locked).toBe(true)
    expect(json.taskId).toBe('task-orphan')
    expect(json.reason).toMatch(/not acknowledged/i)
    expect(orch.listJobs()).toHaveLength(0)
  })

  it('rejects an unsupported method on the lock route', async () => {
    const { res, json } = await post(`/providers/${TESTNET_PROVIDER}/lock`)
    expect(res.status).toBe(405)
    expect(json.code).toBe('method_not_allowed')
  })
})

describe('POST /providers/:provider/unlock', () => {
  it('frees an orphaned queue via acknowledgeDeliverable and never the deprecated path', async () => {
    broker.setTask('task-orphan', 'Delivered')

    const { res, json } = await post(`/providers/${TESTNET_PROVIDER}/unlock`)
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.taskId).toBe('task-orphan')
    expect(json).toHaveProperty('txHash')
    expect(broker.acknowledgeDeliverableCalls).toEqual([
      { provider: TESTNET_PROVIDER, taskId: 'task-orphan' },
    ])
    expect(broker.usedDeprecatedPath()).toBe(false)
  })

  it('502s rather than reporting a fake success when there is nothing to unlock', async () => {
    const { res, json } = await post(`/providers/${TESTNET_PROVIDER}/unlock`)
    expect(res.status).toBe(502)
    expect(json.error).toMatch(/nothing to unlock/i)
    expect(json.code).toBe('unlock_failed')
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(0)
  })

  it('reports a genuine on-chain failure with a 502 and the underlying message', async () => {
    broker.setTask('task-orphan', 'Delivered')
    broker.acknowledgeDeliverableErrors.push(new Error('insufficient funds for gas'))

    const { res, json } = await post(`/providers/${TESTNET_PROVIDER}/unlock`)
    expect(res.status).toBe(502)
    expect(json.error).toMatch(/insufficient funds/)
    expect(json.code).toBe('unlock_failed')
  })

  it('rejects an unsupported method on the unlock route', async () => {
    const { res, json } = await get(`/providers/${TESTNET_PROVIDER}/unlock`)
    expect(res.status).toBe(405)
    expect(json.code).toBe('method_not_allowed')
  })

  it('400s when no provider address was given', async () => {
    const { res, json } = await post('/providers')
    expect(res.status).toBe(400)
    expect(json.code).toBe('invalid_provider')
  })

  it('404s an unknown sub-route with the same structured shape as everywhere else', async () => {
    const { res, json } = await get(`/providers/${TESTNET_PROVIDER}/nonsense`)
    expect(res.status).toBe(404)
    expect(json.code).toBe('not_found')
    expect(json.error).toMatch(/No such route/)
  })
})

describe('GET /jobs/:id/stream (SSE)', () => {
  it('streams the current job immediately, then live updates, as event: state', async () => {
    const a = (await post('/jobs', validBody)).json
    broker.nextTaskId = 'task-sse'

    const controller = new AbortController()
    const res = await fetch(`${base}/jobs/${a.id}/stream`, { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    const first = decoder.decode((await reader.read()).value)
    expect(first).toContain('event: state')
    expect(first).toContain('data: ')
    const firstPayload = JSON.parse(first.split('data: ')[1]!.split('\n')[0]!)
    expect(firstPayload.id).toBe(a.id)
    expect(firstPayload.state).toBe('Init')

    // Cause a transition; it must arrive on the open stream.
    await orch.tick()
    broker.setTask('task-sse', 'Training')
    await orch.tick()

    let sawTraining = false
    for (let i = 0; i < 6 && !sawTraining; i++) {
      const chunk = decoder.decode((await reader.read()).value ?? new Uint8Array())
      if (chunk.includes('"state":"Training"')) sawTraining = true
    }
    expect(sawTraining).toBe(true)

    controller.abort()
    await reader.cancel().catch(() => undefined)
  })

  it('404s a stream for an unknown job', async () => {
    const { res } = await get('/jobs/nope/stream')
    expect(res.status).toBe(404)
  })
})

describe('job panel fields over HTTP', () => {
  it('echoes model, config, fee and dataset once submitted', async () => {
    broker.setPrice(TESTNET_PROVIDER, 800_000_000_000n)
    const a = (
      await post('/jobs', {
        ...validBody,
        dataset: { format: 'chat', exampleCount: 30, tokenCount: 10_000 },
      })
    ).json
    expect(a.model).toBe('Qwen2.5-0.5B-Instruct')
    expect(a.config).toEqual(CONFIG)
    expect(a.dataset).toEqual({ format: 'chat', exampleCount: 30, tokenCount: 10_000 })

    await orch.tick()

    const { json } = await get(`/jobs/${a.id}`)
    expect(json.fee.trainingNeuron).toBe('24000000000000000')
    expect(json.fee.totalNeuron).toBe('34000000000000000')
    expect(typeof json.fee.totalNeuron).toBe('string')
    expect(json.config.num_train_epochs).toBe(3)
  })

  it('omits the four optional fields on a job that has none', async () => {
    const a = (
      await post('/jobs', { network: 'testnet', provider: TESTNET_PROVIDER, datasetRootHash: '0xr' })
    ).json
    expect(a.model).toBeUndefined()
    expect(a.config).toBeUndefined()
    expect(a.fee).toBeUndefined()
    expect(a.dataset).toBeUndefined()
    expect(a.state).toBe('Init')
  })

  it('rejects a dataset summary with a format 0G does not accept', async () => {
    const { res, json } = await post('/jobs', {
      ...validBody,
      dataset: { format: 'parquet', exampleCount: 10, tokenCount: 10 },
    })
    expect(res.status).toBe(400)
    expect(json.error).toMatch(/format/i)
  })
})

describe('state history and deadline flag over HTTP', () => {
  it('serves the timestamped transitions the client draws a timeline from', async () => {
    const a = (await post('/jobs', validBody)).json
    expect(a.transitions).toEqual([{ state: 'Init', at: '2026-08-14T12:00:00.000Z' }])

    broker.nextTaskId = 'task-history'
    await orch.tick()
    clock.advance(HOUR)
    broker.setTask('task-history', 'Training')
    await orch.tick()

    const { json } = await get(`/jobs/${a.id}`)
    expect(json.transitions.map((t: { state: string }) => t.state)).toEqual(['Init', 'Training'])
    // ISO strings, same as every other timestamp on the wire.
    expect(json.transitions[1].at).toBe('2026-08-14T13:00:00.000Z')
    expect(typeof json.transitions[1].at).toBe('string')
  })

  it('exposes ackDeadlineMissed as a boolean field, not buried in the error text', async () => {
    const a = (await post('/jobs', validBody)).json
    expect(a.ackDeadlineMissed).toBe(false)
    expect(a.artifactAtRisk).toBe(false)

    const { json } = await get(`/jobs/${a.id}`)
    // Present on every response, so a client never has to parse `error` to
    // find the one outcome that costs the model and 30% of the fee.
    expect(Object.keys(json)).toContain('ackDeadlineMissed')
    expect(json.ackDeadlineMissed).toBe(false)
  })
})

describe('GET /passports', () => {
  const writePassport = (name: string, content: unknown) => {
    const pdir = join(dir, 'passports')
    mkdirSync(pdir, { recursive: true })
    writeFileSync(join(pdir, name), JSON.stringify(content))
  }

  const manifest = {
    version: 1,
    network: 'testnet',
    chainId: 16602,
    createdAt: '2026-08-14T12:00:00.000Z',
    task: { id: 'task-p', provider: TESTNET_PROVIDER, state: 'Finished' },
    base: { model: 'Qwen2.5-0.5B-Instruct' },
  }

  it('returns an empty list when nothing has been minted', async () => {
    const { res, json } = await get('/passports')
    expect(res.status).toBe(200)
    expect(json).toEqual([])
  })

  it('wraps a bare manifest in a PassportRecord with an id and null mint data', async () => {
    writePassport('task-p.json', manifest)

    const { json: list } = await get('/passports')
    expect(list).toHaveLength(1)
    const record = list[0]
    expect(record.id).toBe('task-p')
    expect(record.manifest.chainId).toBe(16602)
    expect(record.manifest.task.id).toBe('task-p')
    // Passport.sol is not deployed yet — un-minted is a valid state, not an error.
    expect(record.mint).toEqual({
      tokenId: null,
      contractAddress: null,
      txHash: null,
      owner: null,
      mintedAt: null,
    })
  })

  it('serves the same record shape from /passports/:id', async () => {
    writePassport('task-p.json', manifest)
    const { res, json } = await get('/passports/task-p')
    expect(res.status).toBe(200)
    expect(json.id).toBe('task-p')
    expect(json.manifest.chainId).toBe(16602)
    expect(json.mint.tokenId).toBeNull()
  })

  it('preserves mint data when the passport file already carries it', async () => {
    writePassport('minted.json', {
      id: 'minted-one',
      manifest,
      mint: {
        tokenId: '7',
        contractAddress: '0xcontract',
        txHash: '0xtx',
        owner: '0xowner',
        mintedAt: '2026-08-14T13:00:00.000Z',
      },
      name: 'Sentiment adapter',
      summary: 'A tiny LoRA',
    })

    const { json } = await get('/passports/minted-one')
    expect(json.mint.tokenId).toBe('7')
    expect(json.mint.owner).toBe('0xowner')
    expect(json.name).toBe('Sentiment adapter')
    expect(json.summary).toBe('A tiny LoRA')
    expect(json.manifest.task.id).toBe('task-p')
  })

  it('fills in any mint field the file leaves out', async () => {
    writePassport('partial.json', { manifest, mint: { tokenId: '3' } })
    const { json } = await get('/passports/task-p')
    expect(json.mint.tokenId).toBe('3')
    expect(json.mint.owner).toBeNull()
    expect(json.mint.contractAddress).toBeNull()
  })

  it('can be looked up by filename as well as by task id', async () => {
    writePassport('by-file-name.json', manifest)
    const { res } = await get('/passports/by-file-name')
    expect(res.status).toBe(200)
  })

  it('404s an unknown passport', async () => {
    const { res, json } = await get('/passports/nope')
    expect(res.status).toBe(404)
    expect(json.code).toBe('passport_not_found')
  })
})

describe('transport concerns', () => {
  it('404s an unknown route with a structured error', async () => {
    const { res, json } = await get('/nonsense')
    expect(res.status).toBe(404)
    expect(json.error).toBeDefined()
  })

  it('answers CORS preflight so the web app can call it from another origin', async () => {
    const res = await fetch(`${base}/jobs`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/)
  })

  it('rejects an unsupported method on a known path', async () => {
    const res = await fetch(`${base}/health`, { method: 'DELETE' })
    expect(res.status).toBe(405)
  })
})
