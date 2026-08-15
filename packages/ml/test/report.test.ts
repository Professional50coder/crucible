import { describe, expect, it } from 'vitest'

import { analyzeDataset } from '../src/analyze/report.js'

const chat = (q: string, a: string) => ({
  messages: [
    { role: 'user', content: q },
    { role: 'assistant', content: a },
  ],
})

const topics = [
  'photosynthesis converts sunlight into chemical energy inside chloroplasts',
  'the treaty of westphalia ended the thirty years war in europe',
  'a binary search halves the remaining interval on every iteration',
  'humpback whales migrate thousands of kilometres to breeding grounds',
  'the maillard reaction browns food and creates hundreds of flavour compounds',
  'plate tectonics explains earthquakes volcanoes and mountain formation',
  'compound interest grows principal exponentially rather than linearly',
  'the printing press dramatically lowered the cost of reproducing books',
  'antibiotics are ineffective against viral infections such as influenza',
  'a suspension bridge carries load through tension in its main cables',
  'the doppler effect shifts observed frequency for a moving source',
  'mycorrhizal fungi exchange nutrients with plant roots underground',
]

/** A clean, well-formed dataset of `n` distinct records. */
const cleanTrain = (n = 12) => topics.slice(0, n).map((q, i) => chat(q, `answer about topic ${i}`))

/**
 * Generates genuinely distinct records — different vocabulary in every one, so
 * they neither collide as near-duplicates nor look like class labels. Needed
 * because the topic list is finite and 0G's own guidance is 200+ examples, so
 * a hand-written fixture cannot reach a no-warnings dataset.
 */
const SUBJECTS = ['engineer', 'botanist', 'archivist', 'welder', 'cartographer', 'sommelier',
  'geologist', 'puppeteer', 'radiographer', 'stonemason']
const VERBS = ['catalogued', 'dismantled', 'rehearsed', 'irrigated', 'transcribed', 'calibrated',
  'smuggled', 'annotated', 'polished', 'surveyed']
const OBJECTS = ['harpsichords', 'monsoon charts', 'lighthouse lenses', 'saffron crates',
  'seismographs', 'orchard ledgers', 'tramway blueprints', 'vellum manuscripts',
  'kiln thermometers', 'estuary buoys']
const PLACES = ['in Reykjavik', 'beneath Valparaiso', 'across the Deccan', 'near Tromso',
  'throughout Kyushu', 'along the Zambezi', 'outside Tashkent', 'within Patagonia',
  'above Trondheim', 'past the Hebrides']

const syntheticTrain = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const q =
      `${SUBJECTS[i % 10]} ${VERBS[Math.floor(i / 10) % 10]} ` +
      `${OBJECTS[Math.floor(i / 3) % 10]} ${PLACES[Math.floor(i / 7) % 10]} number ${i}`
    return chat(q, `a distinct free-form response concerning entry ${i} and its particulars`)
  })

describe('analyzeDataset — clean data', () => {
  it('rates a clean, adequately sized dataset as ok', () => {
    const report = analyzeDataset({ train: syntheticTrain(250) })
    expect(report.issues).toEqual([])
    expect(report.severity).toBe('ok')
  })

  it('warns — but only about size — on a small but otherwise clean dataset', () => {
    const report = analyzeDataset({ train: cleanTrain() })
    expect(report.severity).toBe('warn')
    expect(report.issues.map((i) => i.code)).toEqual(['small-dataset'])
  })

  it('reports the example count and format', () => {
    const report = analyzeDataset({ train: cleanTrain() })
    expect(report.exampleCount).toBe(12)
    expect(report.format).toBe('chat')
  })

  it('produces no blocking issues', () => {
    const report = analyzeDataset({ train: cleanTrain() })
    expect(report.issues.filter((i) => i.severity === 'fail')).toEqual([])
  })

  it('still includes every section', () => {
    const report = analyzeDataset({ train: cleanTrain() })
    expect(report.duplicates).toBeDefined()
    expect(report.length).toBeDefined()
    expect(report.pii).toBeDefined()
    expect(report.classBalance).toBeDefined()
  })
})

describe('analyzeDataset — leakage is a hard failure', () => {
  const train = cleanTrain()
  const test = [chat(topics[0]!, 'answer about topic 0'), chat(topics[1]!, 'answer about topic 1')]

  it('rates any train/test leakage as fail', () => {
    const report = analyzeDataset({ train, test })
    expect(report.severity).toBe('fail')
  })

  it('reports the leaked pairs with both line numbers', () => {
    const report = analyzeDataset({ train, test })
    expect(report.leakage!.exact.length).toBeGreaterThan(0)
    expect(report.leakage!.exact[0]!.trainLine).toBeGreaterThan(0)
    expect(report.leakage!.exact[0]!.testLine).toBeGreaterThan(0)
  })

  it('recommends removing the leaked examples, naming the counts', () => {
    const report = analyzeDataset({ train, test })
    const recommendation = report.recommendations.find((r) => /shares/i.test(r))

    expect(recommendation).toBeDefined()
    expect(recommendation).toMatch(/2 example/)
    expect(recommendation).toMatch(/remove/i)
  })

  it('says plainly that eval results cannot be trusted', () => {
    const report = analyzeDataset({ train, test })
    expect(report.recommendations.join(' ')).toMatch(/eval/i)
  })

  it('omits the leakage section entirely when no test set was supplied', () => {
    const report = analyzeDataset({ train })
    expect(report.leakage).toBeUndefined()
  })

  it('does not fail a clean split', () => {
    const all = syntheticTrain(60)
    const report = analyzeDataset({ train: all.slice(0, 50), test: all.slice(50) })
    expect(report.leakage!.clean).toBe(true)
    expect(report.severity).not.toBe('fail')
  })
})

describe('analyzeDataset — duplicates', () => {
  it('warns about exact duplicates and counts the redundant rows', () => {
    const train = [...cleanTrain(10), chat(topics[0]!, 'answer about topic 0')]
    const report = analyzeDataset({ train })

    expect(report.duplicates.exact.length).toBeGreaterThan(0)
    expect(report.severity).toBe('warn')
  })

  it('fails when duplicates dominate the dataset', () => {
    const train = Array.from({ length: 20 }, () => chat(topics[0]!, 'the same answer'))
    const report = analyzeDataset({ train })

    expect(report.severity).toBe('fail')
    expect(report.recommendations.join(' ')).toMatch(/duplicate/i)
  })

  it('reports near duplicates separately from exact ones', () => {
    const train = [
      ...cleanTrain(10),
      chat('the capital of france is paris and it is a lovely city', 'x'),
      chat('the capital of france is paris and it is a lovely town', 'x'),
    ]
    const report = analyzeDataset({ train, nearDuplicateThreshold: 0.7 })

    expect(report.duplicates.exact).toEqual([])
    expect(report.duplicates.near.length).toBeGreaterThan(0)
  })
})

describe('analyzeDataset — PII', () => {
  it('fails on a high-severity secret', () => {
    const train = [...cleanTrain(11), chat('deploy with key', `0x${'a1b2c3d4'.repeat(8)}`)]
    const report = analyzeDataset({ train })

    expect(report.severity).toBe('fail')
    expect(report.pii.highSeverityCount).toBeGreaterThan(0)
  })

  it('warns but does not fail on an email address', () => {
    const train = [...cleanTrain(11), chat('contact', 'reach me at dave@example.com')]
    const report = analyzeDataset({ train })

    expect(report.severity).toBe('warn')
  })

  it('never puts a raw secret in the report', () => {
    const key = `0x${'a1b2c3d4'.repeat(8)}`
    const train = [...cleanTrain(11), chat('deploy with key', key)]
    const report = analyzeDataset({ train })

    expect(JSON.stringify(report)).not.toContain(key)
  })
})

describe('analyzeDataset — dataset size and validity', () => {
  it('fails a dataset below 0G minimum of 10 examples', () => {
    const report = analyzeDataset({ train: cleanTrain(5) })

    expect(report.severity).toBe('fail')
    expect(report.recommendations.join(' ')).toMatch(/10/)
  })

  it('warns that a small-but-legal dataset is unlikely to change behaviour', () => {
    const report = analyzeDataset({ train: cleanTrain(12) })
    expect(report.recommendations.join(' ')).toMatch(/200/)
  })

  it('fails on mixed formats, which 0G rejects', () => {
    const train = [...cleanTrain(10), { text: 'a plain passage' }, { text: 'another passage' }]
    const report = analyzeDataset({ train })

    expect(report.severity).toBe('fail')
    expect(report.recommendations.join(' ')).toMatch(/format/i)
  })

  it('fails on records matching none of the three 0G formats', () => {
    const report = analyzeDataset({ train: [...cleanTrain(11), { nonsense: true }] })
    expect(report.severity).toBe('fail')
  })

  it('handles an entirely empty dataset without throwing', () => {
    const report = analyzeDataset({ train: [] })
    expect(report.severity).toBe('fail')
    expect(report.exampleCount).toBe(0)
  })
})

describe('analyzeDataset — class balance', () => {
  it('warns about a severe class imbalance and quotes the majority baseline', () => {
    const train = [
      ...Array.from({ length: 38 }, (_, i) => chat(`review ${i} with distinctive words ${i}`, 'positive')),
      ...Array.from({ length: 2 }, (_, i) => chat(`different review ${i} entirely unlike`, 'negative')),
    ]
    const report = analyzeDataset({ train })

    expect(report.classBalance.imbalanced).toBe(true)
    expect(report.recommendations.join(' ')).toMatch(/95%|0\.95|baseline/i)
  })

  it('says nothing about balance for free-text data', () => {
    const report = analyzeDataset({ train: cleanTrain() })
    expect(report.classBalance.isClassificationShaped).toBe(false)
  })
})

describe('analyzeDataset — output contract', () => {
  it('gives every issue a code, a severity and a message', () => {
    const report = analyzeDataset({ train: cleanTrain(5) })
    for (const issue of report.issues) {
      expect(typeof issue.code).toBe('string')
      expect(['warn', 'fail']).toContain(issue.severity)
      expect(issue.message.length).toBeGreaterThan(0)
    }
  })

  it('escalates severity to the worst issue present', () => {
    const train = [
      ...cleanTrain(10),
      chat(topics[0]!, 'answer about topic 0'), // duplicate -> warn
      chat('deploy', `0x${'a1b2c3d4'.repeat(8)}`), // secret -> fail
    ]
    expect(analyzeDataset({ train }).severity).toBe('fail')
  })

  it('is deterministic', () => {
    const train = cleanTrain()
    expect(analyzeDataset({ train })).toEqual(analyzeDataset({ train }))
  })

  it('produces recommendations as plain actionable sentences', () => {
    const train = cleanTrain(12)
    const test = [chat(topics[0]!, 'answer about topic 0')]
    const report = analyzeDataset({ train, test })

    for (const recommendation of report.recommendations) {
      expect(recommendation.length).toBeGreaterThan(10)
      expect(recommendation).not.toContain('\n')
    }
  })

  it('matches the worked example from the brief', () => {
    // "your 40-example test set shares 6 examples with train"
    const train = topics.slice(0, 12).map((q, i) => chat(q, `a${i}`))
    const test = [
      ...topics.slice(0, 6).map((q, i) => chat(q, `a${i}`)),
      ...Array.from({ length: 34 }, (_, i) =>
        chat(`an entirely unseen held out question number ${i} about assorted matters`, `x${i}`),
      ),
    ]

    const report = analyzeDataset({ train, test })
    const recommendation = report.recommendations.find((r) => /shares/i.test(r))!

    expect(recommendation).toMatch(/40-example test set/)
    expect(recommendation).toMatch(/6 examples/)
  })
})
