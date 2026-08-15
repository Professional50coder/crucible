import { describe, expect, it } from 'vitest'

import { trainTestLeakage } from '../src/analyze/leakage.js'
import { normaliseRecords } from '../src/analyze/records.js'

const chat = (q: string, a: string) => ({
  messages: [
    { role: 'user', content: q },
    { role: 'assistant', content: a },
  ],
})

const distinct = [
  'photosynthesis converts sunlight into chemical energy inside chloroplasts',
  'the treaty of westphalia ended the thirty years war in europe',
  'a binary search halves the remaining interval on every iteration',
  'humpback whales migrate thousands of kilometres to breeding grounds',
  'the maillard reaction browns food and creates hundreds of flavour compounds',
  'plate tectonics explains earthquakes volcanoes and mountain formation',
]

const trainOf = (questions: string[]) =>
  normaliseRecords(questions.map((q, i) => chat(q, `answer ${i}`)))

describe('trainTestLeakage — exact leaks', () => {
  it('finds a test example that appears verbatim in train', () => {
    const train = trainOf(distinct)
    const test = normaliseRecords([chat(distinct[2]!, 'answer 2')])

    const report = trainTestLeakage(train, test)

    expect(report.exact).toHaveLength(1)
    expect(report.exact[0]!.trainLine).toBe(3)
    expect(report.exact[0]!.testLine).toBe(1)
    expect(report.exact[0]!.similarity).toBe(1)
  })

  it('finds a leak despite case and whitespace differences', () => {
    const train = trainOf(['What is the capital of France?'])
    const test = normaliseRecords([chat('what   IS the capital of france?', 'Paris')])

    expect(trainTestLeakage(train, test).exact).toHaveLength(1)
  })

  it('flags a leak on the question even when the two answers differ', () => {
    // This is the nastiest variant: the model has already seen the question, so
    // the eval is contaminated, but a whole-record comparison would miss it.
    const train = normaliseRecords([chat('What is the capital of France?', 'Paris')])
    const test = normaliseRecords([chat('What is the capital of France?', 'PARIS, France')])

    const report = trainTestLeakage(train, test)

    expect(report.exact).toHaveLength(1)
    expect(report.exact[0]!.identicalRecord).toBe(false)
  })

  it('marks a fully identical record as such', () => {
    const train = normaliseRecords([chat('q', 'a')])
    const test = normaliseRecords([chat('q', 'a')])
    expect(trainTestLeakage(train, test).exact[0]!.identicalRecord).toBe(true)
  })

  it('reports every train line a test example leaked from', () => {
    const train = trainOf([distinct[0]!, distinct[0]!, distinct[1]!])
    const test = normaliseRecords([chat(distinct[0]!, 'answer 0')])

    const report = trainTestLeakage(train, test)

    expect(report.exact.map((l) => l.trainLine).sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('finds nothing when the split is clean', () => {
    const train = trainOf(distinct.slice(0, 4))
    const test = trainOf(distinct.slice(4))

    const report = trainTestLeakage(train, test)

    expect(report.exact).toEqual([])
    expect(report.near).toEqual([])
    expect(report.clean).toBe(true)
  })
})

describe('trainTestLeakage — near leaks', () => {
  // Measured: adding a comma and an exclamation mark to a 46-character sentence
  // drops character-5-gram Jaccard to 0.796. Short texts are punctuation-sensitive,
  // which is exactly why the default threshold is 0.75 and not 0.85.
  it('finds a paraphrase-by-punctuation leak', () => {
    const train = trainOf(['The capital of France is Paris and it is lovely'])
    const test = normaliseRecords([chat('The capital of France is Paris, and it is lovely!', 'x')])

    const report = trainTestLeakage(train, test, { threshold: 0.75 })

    expect(report.exact).toEqual([])
    expect(report.near).toHaveLength(1)
    expect(report.near[0]!.similarity).toBeGreaterThan(0.75)
    expect(report.near[0]!.trainLine).toBe(1)
    expect(report.near[0]!.testLine).toBe(1)
  })

  it('catches that same punctuation-only leak at the DEFAULT threshold', () => {
    const train = trainOf(['The capital of France is Paris and it is lovely'])
    const test = normaliseRecords([chat('The capital of France is Paris, and it is lovely!', 'x')])

    // A missed leak silently corrupts every eval number downstream; a false alarm
    // costs the user one glance. The default is tuned for recall accordingly.
    expect(trainTestLeakage(train, test).near).toHaveLength(1)
  })

  it('does not report a near leak that is also an exact leak, twice', () => {
    const train = trainOf([distinct[0]!])
    const test = normaliseRecords([chat(distinct[0]!, 'answer 0')])

    const report = trainTestLeakage(train, test, { threshold: 0.5 })

    expect(report.exact).toHaveLength(1)
    expect(report.near).toEqual([])
  })

  it('respects the threshold', () => {
    const train = trainOf(['the quick brown fox jumps over the lazy dog'])
    const test = normaliseRecords([chat('the quick brown cat jumps over the lazy dog', 'x')])

    expect(trainTestLeakage(train, test, { threshold: 0.5 }).near).toHaveLength(1)
    expect(trainTestLeakage(train, test, { threshold: 0.99 }).near).toEqual([])
  })

  it('leaves unrelated examples alone', () => {
    const train = trainOf(distinct.slice(0, 3))
    const test = trainOf(distinct.slice(3))
    expect(trainTestLeakage(train, test, { threshold: 0.5 }).near).toEqual([])
  })
})

describe('trainTestLeakage — summary', () => {
  it('counts contaminated test examples, not leaked pairs', () => {
    // One test example leaking from three train rows is ONE unusable test example.
    const train = trainOf([distinct[0]!, distinct[0]!, distinct[0]!, distinct[1]!])
    const test = normaliseRecords([chat(distinct[0]!, 'a'), chat(distinct[4]!, 'b')])

    const report = trainTestLeakage(train, test)

    expect(report.exact.length).toBe(3)
    expect(report.contaminatedTestLines).toEqual([1])
    expect(report.contaminatedTestCount).toBe(1)
    expect(report.testExampleCount).toBe(2)
  })

  it('reports the contaminated fraction of the test set', () => {
    const train = trainOf(distinct.slice(0, 4))
    const test = normaliseRecords([
      chat(distinct[0]!, 'a'),
      chat(distinct[1]!, 'b'),
      chat('a genuinely unseen question about submarine cable repair', 'c'),
      chat('another unseen question regarding medieval crop rotation', 'd'),
    ])

    const report = trainTestLeakage(train, test)

    expect(report.contaminatedTestCount).toBe(2)
    expect(report.contaminatedFraction).toBeCloseTo(0.5, 10)
    expect(report.clean).toBe(false)
  })

  it('is clean and zero-fraction for an empty test set, without dividing by zero', () => {
    const report = trainTestLeakage(trainOf(distinct), [])
    expect(report.contaminatedFraction).toBe(0)
    expect(report.clean).toBe(true)
  })

  it('handles an empty train set', () => {
    const report = trainTestLeakage([], trainOf(distinct))
    expect(report.clean).toBe(true)
    expect(report.exact).toEqual([])
  })

  it('carries redacted previews of both sides for the user to go and look', () => {
    const train = trainOf([distinct[0]!])
    const test = normaliseRecords([chat(distinct[0]!, 'a')])
    const leak = trainTestLeakage(train, test).exact[0]!

    expect(leak.preview.length).toBeGreaterThan(0)
    expect(leak.preview.length).toBeLessThanOrEqual(120)
  })

  it('is deterministic', () => {
    const train = trainOf(distinct)
    const test = normaliseRecords(distinct.slice(0, 2).map((q) => chat(q, 'a')))
    expect(trainTestLeakage(train, test)).toEqual(trainTestLeakage(train, test))
  })

  it('scales to a large train set without changing its verdict', () => {
    // Forces the blocked/MinHash path; the answer must not depend on dataset size.
    const filler = Array.from({ length: 1200 }, (_, i) =>
      chat(`unrelated training question about topic ${i} ${'padding '.repeat(i % 5)}`, `a${i}`),
    )
    const train = normaliseRecords([...filler, chat(distinct[0]!, 'leaked answer')])
    const test = normaliseRecords([chat(distinct[0]!, 'leaked answer')])

    const report = trainTestLeakage(train, test)

    expect(report.contaminatedTestCount).toBe(1)
    expect(report.exact.some((l) => l.trainLine === 1201)).toBe(true)
  })
})
