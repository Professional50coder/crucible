import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Orchestrator } from './orchestrator.js'
import { DirectoryPassportSource, type PassportSource } from './passports.js'
import { toWireJob } from './wire.js'
import type { CreateJobInput, JobDataset, NetworkName, TrainingConfig } from './types.js'

/**
 * The HTTP surface, on `node:http`.
 *
 * No framework: the whole API is eleven routes, and a dependency-free server is
 * one less thing that can fail to install on the machine that is supposed to be
 * babysitting someone's 48-hour deadline.
 *
 * Shapes are fixed by docs/INTERFACES.md §5.
 */

export interface ApiOptions {
  orchestrator: Orchestrator
  version?: string
  passportsDir?: string
  passports?: PassportSource
  /** SSE keep-alive comment interval. */
  heartbeatMs?: number
}

export interface ApiHandle {
  server: Server
  listen(port: number, host?: string): Promise<{ port: number }>
  close(): Promise<void>
}

const NETWORKS = new Set<NetworkName>(['testnet', 'mainnet'])
const DATASET_FORMATS = new Set(['chat', 'instruction', 'text'])

export function createApi(options: ApiOptions): ApiHandle {
  const orch = options.orchestrator
  const version = options.version ?? '0.1.0'
  const passports: PassportSource =
    options.passports ?? new DirectoryPassportSource(options.passportsDir ?? './data/passports')

  const openStreams = new Set<ServerResponse>()

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      sendError(res, 500, message(error), 'internal_error')
    })
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    cors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const method = req.method ?? 'GET'
    const segments = path.split('/').filter(Boolean)

    // GET /health
    if (path === '/health') {
      if (method !== 'GET') return sendError(res, 405, 'Method not allowed', 'method_not_allowed')
      return sendJson(res, 200, { ok: true, version })
    }

    // /jobs
    if (segments[0] === 'jobs') {
      if (segments.length === 1) {
        if (method === 'GET') return sendJson(res, 200, orch.listJobs().map(toWireJob))
        if (method === 'POST') return createJob(req, res)
        return sendError(res, 405, 'Method not allowed', 'method_not_allowed')
      }

      const id = segments[1]!
      const sub = segments[2]

      if (segments.length === 2 && method === 'GET') {
        const job = orch.getJob(id)
        if (!job) return sendError(res, 404, `Job not found: ${id}`, 'job_not_found')
        return sendJson(res, 200, toWireJob(job))
      }

      if (sub === 'logs' && method === 'GET') {
        if (!orch.getJob(id)) return sendError(res, 404, `Job not found: ${id}`, 'job_not_found')
        try {
          return sendJson(res, 200, { logs: await orch.getLogs(id) })
        } catch (error) {
          return sendError(res, 502, message(error), 'log_fetch_failed')
        }
      }

      if (sub === 'stream' && method === 'GET') {
        const job = orch.getJob(id)
        if (!job) return sendError(res, 404, `Job not found: ${id}`, 'job_not_found')
        return stream(req, res, id)
      }

      if (sub === 'unlock' && method === 'POST') {
        if (!orch.getJob(id)) return sendError(res, 404, `Job not found: ${id}`, 'job_not_found')
        try {
          const result = await orch.unlockJob(id)
          return sendJson(res, 200, result)
        } catch (error) {
          return sendError(res, 502, message(error), 'unlock_failed')
        }
      }

      return sendError(res, 404, `No such route: ${method} ${path}`, 'not_found')
    }

    // /providers — the provider-scoped half of the recovery API.
    //
    // `POST /jobs/:id/unlock` can only rescue a queue we have a local job for.
    // The account recovery.ts exists for is precisely the one that arrived with
    // the queue already locked by someone else's earlier task, so it has no
    // local job record and no id to address — leaving it with no HTTP path at
    // all. These two routes take the provider address directly.
    if (segments[0] === 'providers') {
      const provider = segments[1]
      if (typeof provider !== 'string' || provider.length === 0) {
        return sendError(res, 400, 'Field "provider" is required', 'invalid_provider')
      }
      const sub = segments[2]

      if (sub === 'lock') {
        if (method !== 'GET') return sendError(res, 405, 'Method not allowed', 'method_not_allowed')
        try {
          return sendJson(res, 200, await orch.detectLock(provider))
        } catch (error) {
          // A read against the chain failed. That is not "no lock" — reporting
          // `locked: false` here would tell a stranded user everything is fine.
          return sendError(res, 502, message(error), 'lock_detect_failed')
        }
      }

      if (sub === 'unlock') {
        if (method !== 'POST') return sendError(res, 405, 'Method not allowed', 'method_not_allowed')
        try {
          return sendJson(res, 200, await orch.unlock(provider))
        } catch (error) {
          return sendError(res, 502, message(error), 'unlock_failed')
        }
      }

      return sendError(res, 404, `No such route: ${method} ${path}`, 'not_found')
    }

    // /passports
    if (segments[0] === 'passports') {
      if (method !== 'GET') return sendError(res, 405, 'Method not allowed', 'method_not_allowed')
      if (segments.length === 1) return sendJson(res, 200, passports.list())
      const manifest = passports.get(segments[1]!)
      if (!manifest) {
        return sendError(res, 404, `Passport not found: ${segments[1]}`, 'passport_not_found')
      }
      return sendJson(res, 200, manifest)
    }

    return sendError(res, 404, `No such route: ${method} ${path}`, 'not_found')
  }

  async function createJob(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch (error) {
      return sendError(res, 400, `Invalid JSON body: ${message(error)}`, 'invalid_json')
    }

    const network = body.network as NetworkName
    if (!network || !NETWORKS.has(network)) {
      return sendError(res, 400, 'Field "network" must be "testnet" or "mainnet"', 'invalid_network')
    }
    const provider = body.provider
    if (typeof provider !== 'string' || provider.length === 0) {
      return sendError(res, 400, 'Field "provider" is required', 'invalid_provider')
    }
    const datasetRootHash = body.datasetRootHash
    const datasetPath = body.datasetPath
    if (typeof datasetRootHash !== 'string' && typeof datasetPath !== 'string') {
      return sendError(
        res,
        400,
        'Provide either "datasetRootHash" (already uploaded) or "datasetPath" (local file to upload)',
        'missing_dataset',
      )
    }

    const input: CreateJobInput = { network, provider }
    if (typeof body.model === 'string') input.model = body.model
    if (typeof datasetRootHash === 'string') input.datasetRootHash = datasetRootHash
    if (typeof datasetPath === 'string') input.datasetPath = datasetPath
    if (body.config && typeof body.config === 'object') {
      input.trainingConfig = body.config as TrainingConfig
    }

    // An authoritative dataset summary from a caller that already ran core's
    // validator beats anything we could derive locally, so accept it — but only
    // in a format 0G actually takes.
    if (body.dataset !== undefined) {
      const dataset = body.dataset as Record<string, unknown>
      if (typeof dataset !== 'object' || dataset === null) {
        return sendError(res, 400, 'Field "dataset" must be an object', 'invalid_dataset')
      }
      if (!DATASET_FORMATS.has(dataset.format as string)) {
        return sendError(
          res,
          400,
          'Field "dataset.format" must be "chat", "instruction" or "text"',
          'invalid_dataset_format',
        )
      }
      input.dataset = {
        format: dataset.format as JobDataset['format'],
        exampleCount: Number(dataset.exampleCount) || 0,
        tokenCount: Number(dataset.tokenCount) || 0,
      }
    }

    const job = orch.createJob(input)
    return sendJson(res, 201, toWireJob(job))
  }

  /** Server-Sent Events. Sends the current job at once, then every update. */
  function stream(req: IncomingMessage, res: ServerResponse, id: string): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'access-control-allow-origin': '*',
    })
    openStreams.add(res)

    const send = (job: ReturnType<typeof toWireJob>) => {
      res.write(`event: state\ndata: ${JSON.stringify(job)}\n\n`)
    }

    const current = orch.getJob(id)
    if (current) send(toWireJob(current))

    const unsubscribe = orch.on('job', (job) => {
      if (job.id !== id) return
      send(toWireJob(job))
    })

    const heartbeat = setInterval(() => {
      res.write(': keep-alive\n\n')
    }, options.heartbeatMs ?? 20_000)
    heartbeat.unref?.()

    const cleanup = () => {
      clearInterval(heartbeat)
      unsubscribe()
      openStreams.delete(res)
      res.end()
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
  }

  return {
    server,
    listen(port: number, host = '127.0.0.1'): Promise<{ port: number }> {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.removeListener('error', reject)
          resolve({ port: (server.address() as AddressInfo).port })
        })
      })
    },
    close(): Promise<void> {
      for (const res of openStreams) res.end()
      openStreams.clear()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

function cors(res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendError(res: ServerResponse, status: number, error: string, code?: string): void {
  sendJson(res, status, code ? { error, code } : { error })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1_000_000) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw.length === 0) return {}
  const parsed = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('expected a JSON object')
  }
  return parsed as Record<string, unknown>
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
