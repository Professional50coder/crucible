/**
 * The seam between Crucible and the 0G Compute Network.
 *
 * Everything downstream of here depends on `FineTuningPort`, never on the SDK.
 * That is what lets the entire test suite run with no private key, no funds and
 * no network: tests inject a fake, production injects `createRealBroker()`.
 *
 * Shapes mirror `@0gfoundation/0g-compute-ts-sdk` exactly:
 *   - `Task.progress` really is an optional `string` — see
 *     `sdk/fine-tuning/provider/provider.d.ts`. We never assume it is valid.
 *   - `occupied` is a field on the on-chain service struct returned by
 *     `listService()`, not a task field. `true` means the network's single
 *     fine-tuning provider is busy: a queued state, not an error.
 */

export interface Task {
  readonly id?: string
  readonly createdAt?: string
  readonly updatedAt?: string
  userAddress: string
  preTrainedModelHash: string
  datasetHash: string
  trainingParams: string
  fee: string
  nonce: string
  signature: string
  readonly progress?: string
  readonly deliverIndex?: string
}

export interface ProviderService {
  provider: string
  occupied: boolean
  /**
   * Live price in neuron per token, from the on-chain service struct. Used for
   * the pre-flight fee estimate. Optional because a missing price must degrade
   * to "no estimate shown", never to a failed job.
   */
  pricePerToken?: bigint
}

export interface AcknowledgeModelOptions {
  gasPrice?: number
  downloadMethod?: 'tee' | '0g-storage' | 'auto'
  teeIdleTimeoutMs?: number
  teeMaxRetries?: number
}

/**
 * One on-chain deliverable, read from the `FineTuningServing` contract — the
 * authoritative record of what the provider committed. The README's most
 * expensive mistake was trusting the provider API's `progress` field over this;
 * `modelRootHash` here is the hash a retrieved artifact must validate against,
 * and `acknowledged` is the real settlement state, not a rumour.
 */
export interface Deliverable {
  taskId: string
  /** 0G Storage root hash of the delivered model, committed on-chain. */
  modelRootHash: string
  /** `0x` (empty) until the provider settles and publishes the key. */
  encryptedSecret: string
  acknowledged: boolean
}

/**
 * The subset of `broker.fineTuning` Crucible uses.
 *
 * Note what is deliberately ABSENT: `downloadModelFrom0GStorage` and
 * `decryptModel`. Using those two without acknowledging is the exact sequence
 * that permanently locks a user's deliverable queue (Bug #4, May 2026 report).
 * They are not on this port, so no amount of future editing downstream can
 * reach them by accident.
 */
export interface FineTuningPort {
  getTask(provider: string, taskId?: string): Promise<Task>
  listTask(provider: string): Promise<Task[]>
  getLog(provider: string, taskId?: string): Promise<string>
  listService(): Promise<ProviderService[]>
  /**
   * The on-chain deliverable for a task, or `undefined` if the provider has none
   * recorded (e.g. it settled and cleared). Read straight from the serving
   * contract — this is the authority the Windows-safe retrieval validates against.
   */
  getDeliverable(provider: string, taskId: string): Promise<Deliverable | undefined>
  uploadDataset(dataPath: string): Promise<string>
  createTask(
    provider: string,
    model: string,
    datasetHash: string,
    configPath: string,
  ): Promise<string>
  acknowledgeModel(
    provider: string,
    taskId: string,
    dataPath: string,
    options?: AcknowledgeModelOptions,
  ): Promise<void>
  acknowledgeDeliverable(provider: string, taskId: string, gasPrice?: number): Promise<void>
}

/** Errors that mean "busy, come back later" rather than "broken". */
export function isOccupiedError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return (
    message.includes('occupied') ||
    message.includes('provider is busy') ||
    message.includes('another task is running')
  )
}

/**
 * The on-chain revert that means the queue is locked by an unacknowledged
 * previous deliverable. This is the Bug #4 fingerprint.
 */
export function isQueueLockedError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return (
    message.includes('previous deliverable not acknowledged') ||
    message.includes('deliverable not acknowledged')
  )
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * Build a real, wallet-backed port. Imported dynamically so that neither the
 * SDK nor ethers is loaded during tests.
 */
/**
 * The slice of the SDK's `broker.fineTuning` we bind to. Declared structurally
 * so the adapter is type-checked without importing the SDK at build time.
 */
interface SdkFineTuning {
  getTask(provider: string, taskId?: string): Promise<Task>
  listTask(provider: string): Promise<Task[]>
  getLog(provider: string, taskId?: string): Promise<string>
  listService(
    includeUnacknowledged?: boolean,
  ): Promise<Array<{ provider: string; occupied: boolean; pricePerToken?: bigint }>>
  uploadDataset(dataPath: string, gasPrice?: number, maxGasPrice?: number): Promise<string>
  createTask(
    provider: string,
    preTrainedModelName: string,
    datasetHash: string,
    trainingPath: string,
    gasPrice?: number,
  ): Promise<string>
  acknowledgeModel(
    provider: string,
    taskId: string,
    dataPath: string,
    options?: AcknowledgeModelOptions,
  ): Promise<void>
  acknowledgeDeliverable(provider: string, taskId: string, gasPrice?: number): Promise<void>
}

/**
 * `FineTuningServing` addresses, keyed by chain ID. Mirrors the compute SDK's
 * own `CONTRACT_ADDRESSES` (v0.9.0). The public `broker.fineTuning` does not
 * expose the deliverables read, so `getDeliverable` talks to this contract
 * directly — exactly as the read-only `tools/deliverable-status.mjs` does.
 */
const FINE_TUNING_SERVING_BY_CHAIN: Record<number, string> = {
  16602: '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA', // testnet (Galileo)
  16661: '0x4e3474095518883744ddf135b7E0A23301c7F9c0', // mainnet
}

const DELIVERABLES_ABI = [
  'function getDeliverables(address user, address provider) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])',
]

export async function createRealBroker(options: {
  privateKey: string
  rpcUrl: string
}): Promise<FineTuningPort> {
  const { Wallet, JsonRpcProvider, Contract, getBytes, toUtf8String } = await import('ethers')
  const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')

  const provider = new JsonRpcProvider(options.rpcUrl)
  const signer = new Wallet(options.privateKey, provider)
  const broker = await createZGComputeNetworkBroker(signer as never)
  const ft = (broker as unknown as { fineTuning: SdkFineTuning }).fineTuning

  // The task id is stored on-chain as UTF-8 bytes; decode defensively so a
  // provider that ever stored a non-UTF-8 id degrades to "no match" not a throw.
  const decodeId = (raw: string): string => {
    try {
      return toUtf8String(getBytes(raw))
    } catch {
      return raw
    }
  }

  const getDeliverable = async (
    providerAddress: string,
    taskId: string,
  ): Promise<Deliverable | undefined> => {
    const network = await provider.getNetwork()
    const serving = FINE_TUNING_SERVING_BY_CHAIN[Number(network.chainId)]
    if (!serving) {
      throw new Error(
        `No FineTuningServing address known for chain ${network.chainId}; cannot read deliverables.`,
      )
    }
    const contract = new Contract(serving, DELIVERABLES_ABI, provider) as unknown as {
      getDeliverables(
        user: string,
        provider: string,
      ): Promise<
        Array<{ id: string; modelRootHash: string; encryptedSecret: string; acknowledged: boolean }>
      >
    }
    const rows = await contract.getDeliverables(signer.address, providerAddress)
    const match = rows.find((row) => decodeId(row.id) === taskId)
    if (!match) return undefined
    return {
      taskId,
      modelRootHash: match.modelRootHash,
      encryptedSecret: match.encryptedSecret,
      acknowledged: Boolean(match.acknowledged),
    }
  }

  return {
    getTask: (p, t) => ft.getTask(p, t),
    listTask: (p) => ft.listTask(p),
    getLog: (p, t) => ft.getLog(p, t),
    getDeliverable,
    listService: async () => {
      const services = await ft.listService()
      return services.map((s) => ({
        provider: s.provider,
        occupied: Boolean(s.occupied),
        ...(s.pricePerToken !== undefined && s.pricePerToken !== null
          ? { pricePerToken: BigInt(s.pricePerToken) }
          : {}),
      }))
    },
    uploadDataset: (path) => ft.uploadDataset(path),
    createTask: (p, model, datasetHash, configPath) =>
      ft.createTask(p, model, datasetHash, configPath),
    acknowledgeModel: (p, t, dataPath, opts) => ft.acknowledgeModel(p, t, dataPath, opts),
    acknowledgeDeliverable: (p, t, gasPrice) => ft.acknowledgeDeliverable(p, t, gasPrice),
  }
}
