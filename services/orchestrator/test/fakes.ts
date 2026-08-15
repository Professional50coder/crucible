import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FineTuningPort, ProviderService, Task } from '../src/broker.js'
import { openJobStore, type JobStore } from '../src/store.js'
import { ManualClock } from '../src/clock.js'

/**
 * A fake 0G fine-tuning broker. No wallet, no funds, no network.
 *
 * It deliberately also implements the two DEPRECATED methods so that tests can
 * assert Crucible never touches them — the call that causes Bug #4.
 */
export class FakeBroker implements FineTuningPort {
  tasks = new Map<string, Task>()
  logs = new Map<string, string>()
  services: ProviderService[] = []

  calls: string[] = []
  acknowledgeModelCalls: Array<{ provider: string; taskId: string; dataPath: string; options?: unknown }> = []
  acknowledgeDeliverableCalls: Array<{ provider: string; taskId: string }> = []
  createTaskCalls: Array<{ provider: string; model: string; datasetHash: string; configPath: string }> = []
  uploadDatasetCalls: string[] = []

  /** Queue of errors to throw from acknowledgeModel, one per call. */
  acknowledgeModelErrors: Array<Error | null> = []
  acknowledgeDeliverableErrors: Array<Error | null> = []
  createTaskErrors: Array<Error | null> = []
  getTaskErrors: Array<Error | null> = []

  nextTaskId = 'task-1'

  setTask(taskId: string, progress: string | undefined): void {
    this.tasks.set(taskId, {
      id: taskId,
      progress,
      userAddress: '0xuser',
      preTrainedModelHash: '0xmodel',
      datasetHash: '0xdataset',
      trainingParams: '{}',
      fee: '1',
      nonce: '1',
      signature: '0x',
    })
  }

  async getTask(_provider: string, taskId?: string): Promise<Task> {
    this.calls.push('getTask')
    const err = this.getTaskErrors.shift()
    if (err) throw err
    const task = this.tasks.get(taskId ?? '')
    if (!task) throw new Error(`unknown task ${taskId}`)
    return task
  }

  async listTask(_provider: string): Promise<Task[]> {
    this.calls.push('listTask')
    return [...this.tasks.values()]
  }

  async getLog(_provider: string, taskId?: string): Promise<string> {
    this.calls.push('getLog')
    return this.logs.get(taskId ?? '') ?? ''
  }

  async listService(): Promise<ProviderService[]> {
    this.calls.push('listService')
    return this.services
  }

  /** Convenience for tests that only care about the live price. */
  setPrice(provider: string, pricePerToken: bigint, occupied = false): void {
    this.services = [{ provider, occupied, pricePerToken }]
  }

  async uploadDataset(dataPath: string): Promise<string> {
    this.calls.push('uploadDataset')
    this.uploadDatasetCalls.push(dataPath)
    return `0xroot-${dataPath.length}`
  }

  async createTask(
    provider: string,
    model: string,
    datasetHash: string,
    configPath: string,
  ): Promise<string> {
    this.calls.push('createTask')
    this.createTaskCalls.push({ provider, model, datasetHash, configPath })
    const err = this.createTaskErrors.shift()
    if (err) throw err
    this.setTask(this.nextTaskId, 'Init')
    return this.nextTaskId
  }

  async acknowledgeModel(
    provider: string,
    taskId: string,
    dataPath: string,
    options?: unknown,
  ): Promise<void> {
    this.calls.push('acknowledgeModel')
    this.acknowledgeModelCalls.push({ provider, taskId, dataPath, options })
    const err = this.acknowledgeModelErrors.shift()
    if (err) throw err
  }

  async acknowledgeDeliverable(provider: string, taskId: string): Promise<void> {
    this.calls.push('acknowledgeDeliverable')
    this.acknowledgeDeliverableCalls.push({ provider, taskId })
    const err = this.acknowledgeDeliverableErrors.shift()
    if (err) throw err
  }

  // ---- The deprecated Bug #4 path. Present only so tests can prove we never call it.
  async downloadModelFrom0GStorage(): Promise<void> {
    this.calls.push('downloadModelFrom0GStorage')
  }

  async decryptModel(): Promise<void> {
    this.calls.push('decryptModel')
  }

  /** True if the queue-locking legacy path was touched at all. */
  usedDeprecatedPath(): boolean {
    return (
      this.calls.includes('downloadModelFrom0GStorage') || this.calls.includes('decryptModel')
    )
  }
}

export function tempStore(clock: ManualClock): { store: JobStore; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'crucible-orch-'))
  const store = openJobStore({ path: join(dir, 'jobs.ndjson'), clock })
  return {
    store,
    dir,
    cleanup: () => {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export const TESTNET_PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
