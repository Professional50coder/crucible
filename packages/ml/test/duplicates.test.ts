import { describe, expect, it } from 'vitest'

import {
  exactDuplicates,
  jaccard,
  minhashSignature,
  nearDuplicates,
  shingle,
} from '../src/analyze/duplicates.js'
import { normaliseRecords } from '../src/analyze/records.js'

const chat = (q: string, a: string) => ({
  messages: [
    { role: 'user', content: q },
    { role: 'assistant', content: a },
  ],
})

describe('shingle', () => {
  it('produces every character n-gram of the requested size', () => {
    expect([...shingle('abcd', 3)].sort()).toEqual(['abc', 'bcd'])
  })

  it('normalises before shingling so case and spacing do not matter', () => {
    expect([...shingle('  AB  CD ', 3)]).toEqual([...shingle('ab cd', 3)])
  })

  it('returns the whole string as one shingle when it is shorter than n', () => {
    expect([...shingle('ab', 5)]).toEqual(['ab'])
  })

  it('returns an empty set for empty text', () => {
    expect(shingle('', 5).size).toBe(0)
  })

  it('de-duplicates repeated n-grams', () => {
    expect(shingle('aaaa', 2).size).toBe(1)
  })
})

describe('jaccard', () => {
  it('is 1 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1)
  })

  it('is 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0)
  })

  it('matches a hand-computed value', () => {
    // intersection {b, c} = 2, union {a, b, c, d} = 4 -> 0.5
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(0.5)
  })

  it('is 1 for two empty sets and 0 when only one is empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(1)
    expect(jaccard(new Set(['a']), new Set())).toBe(0)
  })
})

describe('minhashSignature', () => {
  it('is deterministic for a fixed seed', () => {
    const s = shingle('the quick brown fox jumps over the lazy dog', 5)
    expect(minhashSignature(s, { seed: 1, permutations: 32 })).toEqual(
      minhashSignature(s, { seed: 1, permutations: 32 }),
    )
  })

  it('changes with the seed', () => {
    const s = shingle('the quick brown fox', 5)
    expect(minhashSignature(s, { seed: 1, permutations: 32 })).not.toEqual(
      minhashSignature(s, { seed: 2, permutations: 32 })
    )
  })

  it('has one entry per permutation', () => {
    const s = shingle('hello world hello world', 4)
    expect(minhashSignature(s, { seed: 1, permutations: 64 })).toHaveLength(64)
  })

  it('approximates Jaccard: signature agreement tracks true similarity', () => {
    const a = shingle('the capital city of France is Paris and it is lovely', 5)
    const b = shingle('the capital city of France is Paris and it is lively', 5)

    const sigA = minhashSignature(a, { seed: 9, permutations: 256 })
    const sigB = minhashSignature(b, { seed: 9, permutations: 256 })

    const agreement = sigA.filter((v, i) => v === sigB[i]).length / sigA.length
    expect(agreement).toBeCloseTo(jaccard(a, b), 1)
  })
})

describe('exactDuplicates', () => {
  it('groups records with identical content and lists their line numbers', () => {
    const records = normaliseRecords([
      chat('What is 2+2?', '4'),
      chat('What is the capital of France?', 'Paris'),
      chat('What is 2+2?', '4'),
      chat('What is 2+2?', '4'),
    ])

    const groups = exactDuplicates(records)

    expect(groups).toHaveLength(1)
    expect(groups[0]!.lines).toEqual([1, 3, 4])
    expect(groups[0]!.count).toBe(3)
  })

  it('ignores case and whitespace differences', () => {
    const records = normaliseRecords([
      chat('What is 2+2?', '4'),
      chat('what   is 2+2?', '4'),
    ])
    expect(exactDuplicates(records)).toHaveLength(1)
  })

  it('returns no groups when every record is unique', () => {
    const records = normaliseRecords([chat('a', '1'), chat('b', '2'), chat('c', '3')])
    expect(exactDuplicates(records)).toEqual([])
  })

  it('reports several independent duplicate groups', () => {
    const records = normaliseRecords([
      chat('a', '1'),
      chat('b', '2'),
      chat('a', '1'),
      chat('b', '2'),
      chat('c', '3'),
    ])
    const groups = exactDuplicates(records)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.lines)).toEqual([
      [1, 3],
      [2, 4],
    ])
  })

  it('counts total duplicate records excluding the first of each group', () => {
    const records = normaliseRecords([chat('a', '1'), chat('a', '1'), chat('a', '1')])
    const groups = exactDuplicates(records)
    expect(groups[0]!.count).toBe(3)
    expect(groups[0]!.redundant).toBe(2)
  })

  it('carries a truncated preview, not the whole record', () => {
    const long = 'x'.repeat(500)
    const records = normaliseRecords([chat(long, 'a'), chat(long, 'a')])
    expect(exactDuplicates(records)[0]!.preview.length).toBeLessThanOrEqual(120)
  })

  it('distinguishes records that differ only in the answer', () => {
    const records = normaliseRecords([chat('same question', 'yes'), chat('same question', 'no')])
    expect(exactDuplicates(records)).toEqual([])
  })

  it('handles an empty dataset', () => {
    expect(exactDuplicates([])).toEqual([])
  })
})

describe('nearDuplicates', () => {
  it('finds a pair that differs only by punctuation', () => {
    const records = normaliseRecords([
      chat('The capital of France is Paris', 'Paris'),
      chat('The capital of France is Paris!', 'Paris'),
      chat('Photosynthesis converts light into chemical energy', 'energy'),
    ])

    const pairs = nearDuplicates(records, { threshold: 0.8 })

    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.lineA).toBe(1)
    expect(pairs[0]!.lineB).toBe(2)
    expect(pairs[0]!.similarity).toBeGreaterThan(0.8)
  })

  it('does not report unrelated records', () => {
    const records = normaliseRecords([
      chat('The capital of France is Paris', 'Paris'),
      chat('Mitochondria are the powerhouse of the cell', 'organelle'),
    ])
    expect(nearDuplicates(records, { threshold: 0.5 })).toEqual([])
  })

  it('respects the threshold', () => {
    const records = normaliseRecords([
      chat('the quick brown fox jumps over the lazy dog', 'a'),
      chat('the quick brown cat jumps over the lazy dog', 'a'),
    ])

    expect(nearDuplicates(records, { threshold: 0.5 })).toHaveLength(1)
    expect(nearDuplicates(records, { threshold: 0.99 })).toEqual([])
  })

  it('reports each pair once, with lineA < lineB', () => {
    const records = normaliseRecords([
      chat('alpha beta gamma delta epsilon', 'x'),
      chat('alpha beta gamma delta epsilon zeta', 'x'),
      chat('alpha beta gamma delta epsilon eta', 'x'),
    ])

    const pairs = nearDuplicates(records, { threshold: 0.7 })
    for (const pair of pairs) expect(pair.lineA).toBeLessThan(pair.lineB)

    const seen = new Set(pairs.map((p) => `${p.lineA}-${p.lineB}`))
    expect(seen.size).toBe(pairs.length)
  })

  it('also reports exact duplicates, at similarity 1', () => {
    const records = normaliseRecords([chat('identical text here', 'a'), chat('identical text here', 'a')])
    const pairs = nearDuplicates(records, { threshold: 0.9 })
    expect(pairs[0]!.similarity).toBe(1)
  })

  it('is deterministic across repeated runs', () => {
    const records = normaliseRecords(
      Array.from({ length: 40 }, (_, i) => chat(`question number ${i} about geography`, `a${i}`)),
    )
    const a = nearDuplicates(records, { threshold: 0.6, seed: 3 })
    const b = nearDuplicates(records, { threshold: 0.6, seed: 3 })
    expect(a).toEqual(b)
  })

  // The MinHash/LSH path exists for large datasets. It must agree with the exact
  // path, otherwise "we scanned your dataset" means different things at different sizes.
  it('the MinHash path finds the same obvious pairs as the exact path', () => {
    // Filler must be genuinely unrelated. Sentences differing only by an index
    // digit share almost all their 5-grams and are correctly flagged as near
    // duplicates, which makes them useless as negative controls.
    const filler = [
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
    ]

    const records = normaliseRecords([
      ...filler.map((q, i) => chat(q, `a${i}`)),
      chat('the capital of france is paris and it is a lovely city', 'x'),
      chat('the capital of france is paris and it is a lovely town', 'x'),
    ])

    const exact = nearDuplicates(records, { threshold: 0.7, exactPairsMaxN: 1000 })
    const viaMinHash = nearDuplicates(records, {
      threshold: 0.7,
      exactPairsMaxN: 0,
      permutations: 256,
      seed: 11,
    })

    expect(exact.map((p) => [p.lineA, p.lineB])).toEqual([[11, 12]])
    expect(viaMinHash.map((p) => [p.lineA, p.lineB])).toEqual([[11, 12]])
  })

  it('reports similarity as a true Jaccard value even on the MinHash path', () => {
    const records = normaliseRecords([
      chat('the capital of france is paris and it is a lovely city', 'x'),
      chat('the capital of france is paris and it is a lovely town', 'x'),
    ])

    const exact = nearDuplicates(records, { threshold: 0.5, exactPairsMaxN: 1000 })
    const viaMinHash = nearDuplicates(records, { threshold: 0.5, exactPairsMaxN: 0, seed: 11 })

    expect(viaMinHash[0]!.similarity).toBe(exact[0]!.similarity)
  })

  it('handles datasets too small to shingle without crashing', () => {
    const records = normaliseRecords([{ text: 'a' }, { text: 'b' }])
    expect(() => nearDuplicates(records, { threshold: 0.5 })).not.toThrow()
  })

  it('handles an empty dataset', () => {
    expect(nearDuplicates([], { threshold: 0.5 })).toEqual([])
  })
})
