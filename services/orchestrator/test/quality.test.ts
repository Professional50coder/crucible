import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// The real library, from the build the runtime loader resolves. Importing it
// here is the point: quality.ts mirrors the report shape structurally (it must
// not depend on the sibling package), so these tests are what stops the mirror
// and the original from drifting apart — the same job test/estimate.test.ts
// does for the duplicated fee maths.
import { analyzeDataset } from '../../../packages/ml/dist/analyze/report.js'
import {
  analyzeDatasetQuality,
  readBoundedJsonl,
  siblingTestPath,
  qualityHeadline,
  scrub,
  toJobQuality,
  MAX_ANALYSIS_RECORDS,
  type DatasetAnalyzer,
  type JobQuality,
} from '../src/quality.js'
import { toWireJob } from '../src/wire.js'
import { Submitter } from '../src/submitter.js'
import { ManualClock } from '../src/clock.js'
import { FakeBroker, tempStore, TESTNET_PROVIDER } from './fakes.js'
import type { JobStore } from '../src/store.js'

const T0 = Date.UTC(2026, 7, 16, 9, 0, 0)

/** A Visa test number. Valid Luhn, so the detector will not dismiss it. */
const CARD = '4111111111111111'

const analyze = analyzeDataset as unknown as DatasetAnalyzer

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crucible-quality-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

function writeJsonl(name: string, records: unknown[]): string {
  const path = join(dir, name)
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8')
  return path
}

/**
 * A deliberately boring, deliberately varied dataset: above the 200-example
 * recommendation, no repeated record, no templated phrasing (which would trip
 * near-duplicate detection), and every record the same order of length (which
 * keeps the Tukey/median-ratio outlier test quiet).
 */
function cleanRecords(count = 220): unknown[] {
  const vocabulary = [
    'ledger', 'harbour', 'quantum', 'basalt', 'meridian', 'cobalt', 'thistle', 'lantern',
    'orbit', 'marrow', 'plinth', 'saffron', 'tundra', 'vellum', 'zephyr', 'juniper',
    'kestrel', 'obsidian', 'palisade', 'rivulet', 'sextant', 'trellis', 'umbra', 'vertex',
    'wicket', 'xylem', 'yarrow', 'zenith', 'alcove', 'bramble', 'cinder', 'dovetail',
    'ember', 'fathom', 'gantry', 'hollow', 'ingot', 'jetty', 'keystone', 'lattice',
  ]
  // Deterministic, no RNG: each record takes a different stride through the
  // vocabulary, so no two records share enough shingles to look alike.
  const records: unknown[] = []
  for (let i = 0; i < count; i += 1) {
    const stride = 1 + (i % 17)
    const words: string[] = []
    for (let k = 0; k < 14; k += 1) {
      words.push(vocabulary[(i * 7 + k * stride) % vocabulary.length]!)
    }
    records.push({
      instruction: `Describe record ${i} using ${words.slice(0, 7).join(' ')}`,
      input: '',
      output: `Record ${i} concerns ${words.slice(7).join(' ')} and its consequences downstream`,
    })
  }
  return records
}

describe('quality — pre-flight dataset analysis at submission', () => {
  it('reports nothing on a clean dataset', async () => {
    const path = writeJsonl('train.jsonl', cleanRecords())
    const quality = (await analyzeDatasetQuality(path, { analyze, now: T0 }))!

    expect(quality.severity).toBe('ok')
    expect(quality.issues).toEqual([])
    expect(quality.duplicates.redundantRecords).toBe(0)
    expect(quality.duplicates.nearPairs).toBe(0)
    expect(quality.pii.total).toBe(0)
    // No sibling test.jsonl, so leakage was never checked — absent, not "clean".
    expect(quality.leakage).toBeUndefined()
    expect(quality.truncated).toBe(false)
    expect(quality.analyzedAt).toBe(T0)
  })

  it('reports exact duplicates', async () => {
    const records = cleanRecords()
    // Twelve copies of one record: redundant, but under the 20% fail fraction.
    const repeated = records[3]
    for (let i = 0; i < 12; i += 1) records.push(repeated)
    const path = writeJsonl('train.jsonl', records)

    const quality = (await analyzeDatasetQuality(path, { analyze, now: T0 }))!

    expect(quality.duplicates.redundantRecords).toBe(12)
    expect(quality.duplicates.exactGroups).toBe(1)
    expect(quality.duplicates.redundantFraction).toBeGreaterThan(0)
    expect(quality.issues.map((i) => i.code)).toContain('exact-duplicates')
    expect(quality.severity).not.toBe('ok')
    expect(quality.recommendations.join(' ')).toMatch(/duplicate/i)
  })

  it('reports train/test leakage from the sibling test split', async () => {
    const records = cleanRecords()
    const trainPath = writeJsonl('train.jsonl', records)
    // The repo's own datasets pair train.jsonl with test.jsonl in one directory
    // (datasets/sentiment, datasets/0g-expert, datasets/dolly-slice).
    writeJsonl('test.jsonl', [records[0], records[1], { instruction: 'unseen question about tidal gantry work', input: '', output: 'an answer that appears nowhere in the training split at all' }])

    const quality = (await analyzeDatasetQuality(trainPath, { analyze, now: T0 }))!

    expect(quality.leakage).toBeDefined()
    expect(quality.leakage!.clean).toBe(false)
    expect(quality.leakage!.testExampleCount).toBe(3)
    expect(quality.leakage!.contaminatedTestCount).toBe(2)
    expect(quality.issues.map((i) => i.code)).toContain('train-test-leakage')
    expect(quality.severity).toBe('fail')
  })

  it('finds no leakage when the splits are disjoint', async () => {
    const records = cleanRecords()
    const trainPath = writeJsonl('train.jsonl', records.slice(0, 200))
    writeJsonl('test.jsonl', records.slice(200))

    const quality = (await analyzeDatasetQuality(trainPath, { analyze, now: T0 }))!
    expect(quality.leakage!.clean).toBe(true)
    expect(quality.leakage!.contaminatedTestCount).toBe(0)
  })

  describe('PII — reported, never echoed', () => {
    it('reports a card number without the digits appearing anywhere in the result', async () => {
      const records = cleanRecords()
      records[5] = {
        instruction: 'Confirm the payment method held on file for this customer account',
        input: '',
        output: `The saved card ending in that account is ${CARD} and it expires next spring`,
      }
      const path = writeJsonl('train.jsonl', records)

      const quality = (await analyzeDatasetQuality(path, { analyze, now: T0 }))!

      // It was found, and it was found at a line the user can go and look at.
      expect(quality.pii.total).toBeGreaterThanOrEqual(1)
      expect(quality.pii.highSeverity).toBeGreaterThanOrEqual(1)
      expect(quality.pii.byType['credit-card']).toBe(1)
      expect(quality.pii.affectedLines).toContain(6)

      // …and the number itself is nowhere in the record that gets written to
      // disk and served over HTTP. Not whole, not spaced, not hyphenated, and
      // not even the partial that the library's own redaction would keep.
      const serialised = JSON.stringify(quality)
      expect(serialised).not.toContain(CARD)
      expect(serialised).not.toContain('4111 1111 1111 1111')
      expect(serialised).not.toContain('4111-1111-1111-1111')
      // No long digit run survives anywhere — `analyzedAt` is the only number
      // in the record allowed to be more than a handful of digits.
      expect(JSON.stringify({ ...quality, analyzedAt: 0 })).not.toMatch(/\d{7,}/)
      // The redacted `sample` field is not copied across at all.
      expect(serialised).not.toContain('sample')
      // Nor does the one-line log summary carry it.
      expect(qualityHeadline(quality)).not.toContain(CARD)
      expect(qualityHeadline(quality)).toMatch(/PII\/secret match/)
    })

    it('reports an API key by type and line only', async () => {
      const records = cleanRecords()
      const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789'
      records[9] = {
        instruction: 'Show the credential used by the deployment script for this service',
        input: '',
        output: `Use ${secret} when calling the endpoint from the deployment runner`,
      }
      const path = writeJsonl('train.jsonl', records)

      const quality = (await analyzeDatasetQuality(path, { analyze, now: T0 }))!
      expect(quality.pii.byType['api-key']).toBe(1)
      expect(quality.issues.map((i) => i.code)).toContain('secrets-detected')
      expect(JSON.stringify(quality)).not.toContain(secret)
      expect(JSON.stringify(quality)).not.toContain('sk-abcdefghij')
    })

    it('scrubs data-derived text on the way onto the record', () => {
      // The library quotes the majority class label in one recommendation. If a
      // label were a card number, that is how it would reach jobs.ndjson.
      const scrubbed = toJobQuality(
        {
          severity: 'warn',
          exampleCount: 10,
          issues: [{ code: 'class-imbalance', severity: 'warn', message: `majority "${CARD}"` }],
          recommendations: [`Your labels are imbalanced in favour of "${CARD}".`],
          duplicates: { exact: [], near: [], redundantCount: 0, redundantFraction: 0 },
          pii: { total: 0, byType: {}, highSeverityCount: 0, affectedLines: [] },
        },
        { now: T0, truncated: false },
      )
      expect(JSON.stringify(scrubbed)).not.toContain(CARD)
      expect(scrubbed.recommendations[0]).toContain('[redacted]')
      expect(scrub('write to a.person@example.com now')).not.toContain('a.person@example.com')
      // Ordinary numbers in ordinary prose survive — the mask is for long runs.
      expect(scrub('median 42 estimated tokens')).toBe('median 42 estimated tokens')
    })
  })

  describe('never fails a job', () => {
    it('returns an unavailable record when the analysis throws', async () => {
      const path = writeJsonl('train.jsonl', cleanRecords(12))
      const exploding: DatasetAnalyzer = () => {
        throw new Error('minhash exploded')
      }

      const quality = (await analyzeDatasetQuality(path, { analyze: exploding, now: T0 }))!
      expect(quality.severity).toBe('unavailable')
      expect(quality.unavailableReason).toContain('minhash exploded')
      expect(quality.issues).toEqual([])
      expect(quality.analyzedAt).toBe(T0)
    })

    it('returns undefined rather than throwing when there is no file to read', async () => {
      await expect(
        analyzeDatasetQuality(join(dir, 'nope.jsonl'), { analyze, now: T0 }),
      ).resolves.toBeUndefined()
      // A directory, not a file: readSync fails. Still no rejection.
      await expect(analyzeDatasetQuality(dir, { analyze, now: T0 })).resolves.toBeDefined()
    })

    it('returns undefined for a file with no parseable records', async () => {
      const path = join(dir, 'train.jsonl')
      writeFileSync(path, 'not json at all\n{broken\n', 'utf8')
      await expect(analyzeDatasetQuality(path, { analyze, now: T0 })).resolves.toBeUndefined()
    })

    it('reports unavailable, not an exception, when @crucible/ml cannot be loaded', async () => {
      const path = writeJsonl('train.jsonl', cleanRecords(12))
      const quality = (await analyzeDatasetQuality(path, {
        analyze: undefined as unknown as DatasetAnalyzer,
        now: T0,
      }))!
      // With no injected analyzer it falls back to runtime resolution. Either
      // outcome is acceptable; a throw is not.
      expect(['ok', 'warn', 'fail', 'unavailable']).toContain(quality.severity)
    })
  })

  describe('bounded work — a 100 MB dataset must not hang submission', () => {
    it('stops at the record cap and says so', () => {
      const path = writeJsonl('train.jsonl', cleanRecords(50))
      const bounded = readBoundedJsonl(path, 1024 * 1024, 10)
      expect(bounded.records).toHaveLength(10)
      expect(bounded.truncated).toBe(true)
    })

    it('stops at the byte cap and drops the partial trailing record', () => {
      const path = writeJsonl('train.jsonl', cleanRecords(50))
      const bounded = readBoundedJsonl(path, 300, 10_000)
      expect(bounded.truncated).toBe(true)
      expect(bounded.records.length).toBeGreaterThan(0)
      // Every record that survived is complete — the cut one was discarded.
      for (const record of bounded.records) {
        expect(record).toHaveProperty('instruction')
      }
    })

    it('does not flag a whole file as truncated when it fits', () => {
      const path = writeJsonl('train.jsonl', cleanRecords(20))
      expect(readBoundedJsonl(path).truncated).toBe(false)
    })

    it('warns that findings only cover the prefix that was read', () => {
      const quality = toJobQuality(
        {
          severity: 'ok',
          exampleCount: MAX_ANALYSIS_RECORDS,
          issues: [],
          recommendations: [],
          duplicates: { exact: [], near: [], redundantCount: 0, redundantFraction: 0 },
          pii: { total: 0, byType: {}, highSeverityCount: 0, affectedLines: [] },
        },
        { now: T0, truncated: true },
      )
      expect(quality.truncated).toBe(true)
      expect(quality.recommendations[0]).toMatch(/only the first/i)
      expect(quality.recommendations[0]).toMatch(/absence of a finding is not evidence of absence/i)
    })
  })

  describe('sibling test-split discovery', () => {
    it('finds test.jsonl next to train.jsonl', () => {
      const trainPath = writeJsonl('train.jsonl', [{ text: 'a' }])
      const testPath = writeJsonl('test.jsonl', [{ text: 'b' }])
      expect(siblingTestPath(trainPath)).toBe(testPath)
    })

    it('returns undefined when there is no split to pair with', () => {
      expect(siblingTestPath(writeJsonl('data.jsonl', [{ text: 'a' }]))).toBeUndefined()
      expect(siblingTestPath(writeJsonl('train.jsonl', [{ text: 'a' }]))).toBeUndefined()
    })
  })

  describe('the wire shape', () => {
    let clock: ManualClock
    let store: JobStore
    let cleanup: () => void

    beforeEach(() => {
      clock = new ManualClock(T0)
      const t = tempStore(clock)
      store = t.store
      cleanup = t.cleanup
    })

    afterEach(() => cleanup())

    it('renders analyzedAt as an ISO string and survives the JSON hop', async () => {
      const path = writeJsonl('train.jsonl', cleanRecords())
      const quality = (await analyzeDatasetQuality(path, { analyze, now: T0 }))!
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const wire = toWireJob(store.update(job.id, { quality }))

      expect(wire.quality!.analyzedAt).toBe('2026-08-16T09:00:00.000Z')
      expect(typeof wire.quality!.analyzedAt).toBe('string')
      expect(wire.quality!.severity).toBe('ok')

      const roundTripped = JSON.parse(JSON.stringify(wire))
      expect(roundTripped.quality.severity).toBe('ok')
      expect(roundTripped.quality.duplicates.redundantRecords).toBe(0)
      expect(roundTripped.quality.pii.total).toBe(0)
      expect(JSON.stringify(wire)).not.toContain('undefined')
    })

    it('omits the key entirely when the job was never analysed', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const wire = toWireJob(job)
      expect(wire.quality).toBeUndefined()
      expect(Object.keys(wire)).not.toContain('quality')
    })
  })

  describe('submitter integration', () => {
    let clock: ManualClock
    let store: JobStore
    let broker: FakeBroker
    let cleanup: () => void
    let submitter: Submitter

    beforeEach(() => {
      clock = new ManualClock(T0)
      const t = tempStore(clock)
      store = t.store
      cleanup = t.cleanup
      broker = new FakeBroker()
      submitter = new Submitter({ store, broker, clock, configDir: join(t.dir, 'configs') })
    })

    afterEach(() => cleanup())

    it('records quality on the job at submission and still submits it', async () => {
      const records = cleanRecords()
      records[7] = {
        instruction: 'Repeat the stored payment detail for the account under review',
        input: '',
        output: `The card on file is ${CARD} and the billing address is unchanged`,
      }
      const datasetPath = writeJsonl('train.jsonl', records)

      const job = store.create({
        network: 'testnet',
        provider: TESTNET_PROVIDER,
        model: 'Qwen2.5-0.5B-Instruct',
        datasetPath,
      })
      await submitter.submitPending()

      const submitted = store.get(job.id)!
      // The advisory 'fail' did NOT stop the job. Crucible reports; the user decides.
      expect(submitted.taskId).toBe('task-1')
      expect(submitted.quality).toBeDefined()
      expect(submitted.quality!.severity).not.toBe('unavailable')
      expect(submitted.quality!.pii.total).toBeGreaterThanOrEqual(1)
      // Durable record and HTTP response are both free of the number.
      expect(JSON.stringify(submitted)).not.toContain(CARD)
      expect(JSON.stringify(toWireJob(submitted))).not.toContain(CARD)
    })

    it('submits normally when there is no local dataset to analyse', async () => {
      const job = store.create({
        network: 'testnet',
        provider: TESTNET_PROVIDER,
        model: 'Qwen2.5-0.5B-Instruct',
        datasetRootHash: '0xalready-uploaded',
      })
      await submitter.submitPending()

      const submitted = store.get(job.id)!
      expect(submitted.taskId).toBe('task-1')
      expect(submitted.quality).toBeUndefined()
    })

    it('never logs the secret it found', async () => {
      const records = cleanRecords()
      records[2] = {
        instruction: 'State the deployment credential currently configured for this runner',
        input: '',
        output: `The key is sk-abcdefghijklmnopqrstuvwxyz0123456789 for the staging runner`,
      }
      const datasetPath = writeJsonl('train.jsonl', records)
      const logs: string[] = []
      const logging = new Submitter({
        store,
        broker,
        clock,
        configDir: join(dir, 'configs'),
        onLog: (_level, message) => logs.push(message),
      })
      store.create({
        network: 'testnet',
        provider: TESTNET_PROVIDER,
        model: 'Qwen2.5-0.5B-Instruct',
        datasetPath,
      })
      await logging.submitPending()

      expect(logs.join('\n')).toMatch(/dataset quality/)
      expect(logs.join('\n')).not.toContain('sk-abcdefghij')
    })
  })

  it('produces a headline that names the three findings that matter', () => {
    const quality: JobQuality = {
      severity: 'fail',
      analyzedAt: T0,
      recordsAnalyzed: 100,
      truncated: false,
      duplicates: { exactGroups: 2, redundantRecords: 9, nearPairs: 1, redundantFraction: 0.09 },
      leakage: { clean: false, testExampleCount: 20, contaminatedTestCount: 4, contaminatedTestLines: [1, 2] },
      pii: { total: 3, highSeverity: 1, byType: { 'credit-card': 1 }, affectedLines: [7] },
      issues: [],
      recommendations: [],
    }
    const headline = qualityHeadline(quality)
    expect(headline).toContain('9 duplicate record(s)')
    expect(headline).toContain('4 leaked test example(s)')
    expect(headline).toContain('3 PII/secret match(es)')
  })
})
