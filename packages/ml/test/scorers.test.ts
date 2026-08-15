import { describe, expect, it } from 'vitest'

import {
  classificationAccuracy,
  containsMatch,
  exactMatch,
  levenshteinDistance,
  levenshteinSimilarity,
  normaliseText,
  SCORERS,
  tokenF1,
  tokenise,
} from '../src/eval/scorers.js'

describe('normaliseText', () => {
  it('trims, lowercases and collapses internal whitespace', () => {
    expect(normaliseText('  Hello   WORLD\n\tagain ')).toBe('hello world again')
  })

  it('is a no-op on already-normalised text', () => {
    expect(normaliseText('hello world')).toBe('hello world')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(normaliseText(' \n\t ')).toBe('')
  })
})

describe('exactMatch', () => {
  it('scores 1 for identical strings', () => {
    expect(exactMatch('Paris', 'Paris')).toBe(1)
  })

  it('scores 1 across case, padding and whitespace differences', () => {
    expect(exactMatch('  PARIS\tis  the answer ', 'paris is the answer')).toBe(1)
  })

  it('scores 0 for different strings', () => {
    expect(exactMatch('Paris', 'London')).toBe(0)
  })

  it('scores 0 when the model returns a superset of the answer', () => {
    expect(exactMatch('The answer is Paris', 'Paris')).toBe(0)
  })

  it('scores 1 when both sides are empty', () => {
    expect(exactMatch('', '   ')).toBe(1)
  })
})

describe('containsMatch', () => {
  it('scores 1 when the expected answer appears inside the output', () => {
    expect(containsMatch('I believe the answer is Paris.', 'paris')).toBe(1)
  })

  it('scores 0 when it does not appear', () => {
    expect(containsMatch('I believe the answer is London.', 'paris')).toBe(0)
  })

  it('scores 0 for an empty expected string rather than trivially passing', () => {
    expect(containsMatch('anything at all', '')).toBe(0)
  })

  it('is whitespace-insensitive', () => {
    expect(containsMatch('answer:   new    york city', 'New York City')).toBe(1)
  })
})

describe('tokenise', () => {
  it('splits on non-alphanumeric characters and drops punctuation', () => {
    expect(tokenise('The cat, sat on the mat!')).toEqual(['the', 'cat', 'sat', 'on', 'the', 'mat'])
  })

  it('returns an empty array for punctuation-only input', () => {
    expect(tokenise('!!! ...')).toEqual([])
  })
})

describe('tokenF1', () => {
  // expected: "the cat sat on the mat" (6 tokens)
  // output:   "the cat sat on a mat"   (6 tokens)
  // multiset overlap: the x1 (output has 1, expected has 2 -> min 1), cat 1, sat 1, on 1, mat 1 = 5
  // precision 5/6, recall 5/6, F1 = 5/6
  it('computes multiset-overlap F1 against a hand-computed value', () => {
    expect(tokenF1('the cat sat on a mat', 'the cat sat on the mat')).toBeCloseTo(5 / 6, 10)
  })

  it('scores 1 for an exact token match', () => {
    expect(tokenF1('The cat sat.', 'the cat sat')).toBe(1)
  })

  it('scores 1 regardless of token order', () => {
    expect(tokenF1('sat cat the', 'the cat sat')).toBe(1)
  })

  it('scores 0 for zero overlap', () => {
    expect(tokenF1('dogs bark loudly', 'the cat sat')).toBe(0)
  })

  // output "a a a b" (4 tokens), expected "a b" (2 tokens)
  // overlap: a -> min(3,1) = 1, b -> min(1,1) = 1 => 2
  // precision 2/4 = 0.5, recall 2/2 = 1, F1 = 2*0.5*1/1.5 = 2/3
  it('penalises repeated-token padding via precision', () => {
    expect(tokenF1('a a a b', 'a b')).toBeCloseTo(2 / 3, 10)
  })

  it('scores 1 when both sides are empty and 0 when only one is', () => {
    expect(tokenF1('', '')).toBe(1)
    expect(tokenF1('something', '')).toBe(0)
    expect(tokenF1('', 'something')).toBe(0)
  })
})

describe('levenshteinDistance', () => {
  it('matches hand-computed distances', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('flaw', 'lawn')).toBe(2)
    expect(levenshteinDistance('', 'abc')).toBe(3)
    expect(levenshteinDistance('abc', 'abc')).toBe(0)
  })
})

describe('levenshteinSimilarity', () => {
  it('normalises to 0..1 by the longer string length', () => {
    // distance 3, longer length 7 -> 1 - 3/7
    expect(levenshteinSimilarity('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7, 10)
  })

  it('scores 1 for equal (normalised) strings', () => {
    expect(levenshteinSimilarity('  Kitten ', 'kitten')).toBe(1)
  })

  it('scores 1 for two empty strings', () => {
    expect(levenshteinSimilarity('', '')).toBe(1)
  })

  it('scores 0 for completely different strings of equal length', () => {
    expect(levenshteinSimilarity('abc', 'xyz')).toBe(0)
  })

  it('never leaves the 0..1 range', () => {
    const s = levenshteinSimilarity('a', 'a much longer string entirely unlike it')
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(1)
  })
})

describe('classificationAccuracy', () => {
  const pairs = [
    { output: 'positive', expected: 'positive' },
    { output: 'Positive', expected: 'positive' },
    { output: 'negative', expected: 'positive' },
    { output: 'negative', expected: 'negative' },
    { output: 'positive', expected: 'negative' },
    { output: 'neutral', expected: 'neutral' },
  ]

  it('computes overall accuracy', () => {
    // correct: 1,2,4,6 => 4/6
    expect(classificationAccuracy(pairs).accuracy).toBeCloseTo(4 / 6, 10)
  })

  it('reports a per-class breakdown with precision, recall and F1', () => {
    const { perClass } = classificationAccuracy(pairs)
    const positive = perClass.find((c) => c.label === 'positive')!

    // positive: support 3 (rows 1,2,3), predicted 3 (rows 1,2,5)
    // true positives 2 -> recall 2/3, precision 2/3, f1 2/3
    expect(positive.support).toBe(3)
    expect(positive.predicted).toBe(3)
    expect(positive.correct).toBe(2)
    expect(positive.recall).toBeCloseTo(2 / 3, 10)
    expect(positive.precision).toBeCloseTo(2 / 3, 10)
    expect(positive.f1).toBeCloseTo(2 / 3, 10)
  })

  it('builds a confusion matrix indexed [expected][predicted]', () => {
    const { labels, confusion } = classificationAccuracy(pairs)
    const i = (l: string) => labels.indexOf(l)

    expect(labels).toEqual(['negative', 'neutral', 'positive'])
    expect(confusion[i('positive')]![i('positive')]).toBe(2)
    expect(confusion[i('positive')]![i('negative')]).toBe(1)
    expect(confusion[i('negative')]![i('negative')]).toBe(1)
    expect(confusion[i('negative')]![i('positive')]).toBe(1)
    expect(confusion[i('neutral')]![i('neutral')]).toBe(1)
  })

  it('counts predictions outside the expected label set as their own class', () => {
    const { labels, unknownPredictions } = classificationAccuracy([
      { output: 'I think it is positive because', expected: 'positive' },
      { output: 'positive', expected: 'positive' },
    ])

    expect(labels).toContain('i think it is positive because')
    expect(unknownPredictions).toBe(1)
  })

  it('handles an empty input without dividing by zero', () => {
    const result = classificationAccuracy([])
    expect(result.accuracy).toBe(0)
    expect(result.labels).toEqual([])
    expect(result.confusion).toEqual([])
  })
})

describe('SCORERS registry', () => {
  it('exposes every per-example scorer by name', () => {
    expect(Object.keys(SCORERS).sort()).toEqual([
      'containsMatch',
      'exactMatch',
      'levenshteinSimilarity',
      'tokenF1',
    ])
  })

  it('every registered scorer returns a value inside 0..1', () => {
    for (const scorer of Object.values(SCORERS)) {
      const s = scorer('some model output here', 'the expected answer')
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})
