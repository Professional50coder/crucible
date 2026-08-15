import { describe, expect, test } from 'vitest'
import { normaliseRecords } from '../src/analyze/records.js'
import { trainTestLeakage } from '../src/analyze/leakage.js'

/**
 * Regression: a shared system prompt must not manufacture leakage.
 *
 * Found by running the analyser against Crucible's own sentiment dataset. It
 * flagged train:36 ("It arrived." -> mixed) against test:7 ("Arrived damaged."
 * -> negative) at similarity 0.8137 — different text, different labels, no leak.
 *
 * The cause: both records carry the same 84-character system prompt, and the
 * user content is a few words. Measured directly, character-5-gram Jaccard is
 * 0.8137 with the system prompt included and 0.1875 on the user content alone.
 * The boilerplate alone clears the 0.75 threshold.
 *
 * This matters because a constant system prompt is *correct* dataset design —
 * 0G's own docs recommend it for classification. So the detector was guaranteed
 * to cry wolf on well-built datasets, and a leakage detector nobody believes is
 * worse than none.
 */
const sys = 'Classify the sentiment of the text as exactly one word: positive, negative, or mixed.'

const chat = (user: string, answer: string) => ({
  messages: [
    { role: 'system', content: sys },
    { role: 'user', content: user },
    { role: 'assistant', content: answer },
  ],
})

describe('leakage detection with a shared system prompt', () => {
  test('does not flag distinct short questions that share a long system prompt', () => {
    const train = normaliseRecords([chat('It arrived.', 'mixed')])
    const test_ = normaliseRecords([chat('Arrived damaged.', 'negative')])

    const result = trainTestLeakage(train, test_)

    expect(result.near).toEqual([])
    expect(result.clean).toBe(true)
  })

  test('still catches a genuine leak when the user content really does repeat', () => {
    const train = normaliseRecords([chat('The battery died within a week.', 'negative')])
    const test_ = normaliseRecords([chat('The battery died within a week!', 'negative')])

    const result = trainTestLeakage(train, test_)

    expect(result.clean).toBe(false)
    expect(result.contaminatedTestLines).toEqual([1])
  })

  test('still catches an exact repeat of the whole record', () => {
    const record = chat('Terrible experience.', 'negative')
    const result = trainTestLeakage(normaliseRecords([record]), normaliseRecords([record]))

    expect(result.clean).toBe(false)
  })

  test('a system prompt alone does not make two empty-content records collide', () => {
    const train = normaliseRecords([chat('Good.', 'positive')])
    const test_ = normaliseRecords([chat('Bad.', 'negative')])

    expect(trainTestLeakage(train, test_).clean).toBe(true)
  })
})
