import { resolve } from 'node:path'
import { createApi } from './api.js'
import { createRealBroker } from './broker.js'
import { MINUTE } from './clock.js'
import { networkFor } from './networks.js'
import { Orchestrator } from './orchestrator.js'

/**
 * Production entrypoint. This is the ONLY file that reads environment variables
 * or constructs a wallet-backed broker — which is why the entire test suite
 * runs without a private key, funds, or network access.
 */
async function main(): Promise<void> {
  const networkName = process.env.CRUCIBLE_NETWORK ?? 'testnet'
  const network = networkFor(networkName)
  const port = Number(process.env.CRUCIBLE_PORT ?? 8787)
  const host = process.env.CRUCIBLE_HOST ?? '127.0.0.1'
  const dataDir = resolve(process.env.CRUCIBLE_DATA_DIR ?? './data')
  const pollIntervalMs = Number(process.env.CRUCIBLE_POLL_INTERVAL_MS ?? MINUTE)
  const privateKey = process.env.PRIVATE_KEY

  if (!privateKey) {
    console.error(
      'PRIVATE_KEY is not set. The orchestrator needs a signer to acknowledge deliverables ' +
        'on your behalf — that is the entire point of the daemon.',
    )
    process.exit(1)
  }

  const log = (level: 'info' | 'warn' | 'error', message: string) => {
    const line = `${new Date().toISOString()} [${level}] ${message}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  const rpcUrl = process.env.CRUCIBLE_RPC_URL ?? network.rpcUrl
  log('info', `connecting to ${networkName} (chain ${network.chainId}) via ${rpcUrl}`)
  const broker = await createRealBroker({ privateKey, rpcUrl })

  const orchestrator = new Orchestrator({ broker, dataDir, pollIntervalMs, onLog: log })
  const api = createApi({
    orchestrator,
    version: process.env.npm_package_version ?? '0.1.0',
    passportsDir: resolve(dataDir, 'passports'),
  })

  await api.listen(port, host)
  orchestrator.start()

  const jobs = orchestrator.listJobs()
  const live = jobs.filter((job) => job.state !== 'Finished' && job.state !== 'Failed')
  log('info', `orchestrator listening on http://${host}:${port}`)
  log('info', `recovered ${jobs.length} job(s) from disk, ${live.length} still live`)
  for (const job of live.filter((j) => j.scheduledAckAt)) {
    log(
      'info',
      `job ${job.id}: acknowledgement scheduled for ${new Date(job.scheduledAckAt!).toISOString()}`,
    )
  }

  const shutdown = async () => {
    log('info', 'shutting down; scheduled work is on disk and will resume on restart')
    await api.close()
    orchestrator.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
