import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDuration,
  formatElapsed,
  formatLearningRate,
  formatOg,
  truncateHash,
} from './format'

describe('truncateHash', () => {
  const hash = '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7'

  it('truncates the middle and keeps both ends', () => {
    expect(truncateHash(hash)).toBe('0xb4f76a88…2c75a7')
  })

  it('keeps the 0x prefix outside the truncation budget', () => {
    const result = truncateHash(hash, 4, 4)
    expect(result).toBe('0xb4f7…75a7')
    expect(result.startsWith('0x')).toBe(true)
  })

  it('honours custom head and tail lengths', () => {
    expect(truncateHash(hash, 12, 8)).toBe('0xb4f76a886b86…6c2c75a7')
  })

  it('leaves short values untouched rather than making them longer', () => {
    expect(truncateHash('0xabc')).toBe('0xabc')
    expect(truncateHash('short')).toBe('short')
  })

  it('handles values with no 0x prefix', () => {
    const plain = 'a'.repeat(64)
    const result = truncateHash(plain)
    expect(result).toBe(`${'a'.repeat(8)}…${'a'.repeat(6)}`)
    expect(result.startsWith('0x')).toBe(false)
  })

  it('returns an empty string for empty input', () => {
    expect(truncateHash('')).toBe('')
  })

  it('never returns something longer than the original', () => {
    for (const length of [10, 14, 15, 16, 20, 64]) {
      const value = `0x${'f'.repeat(length)}`
      expect(truncateHash(value).length).toBeLessThanOrEqual(value.length)
    }
  })
})

describe('formatOg', () => {
  it('renders whole 0G with no decimal point', () => {
    expect(formatOg(10n ** 18n)).toBe('1')
  })

  it('renders the storage reserve fee exactly', () => {
    expect(formatOg(10n ** 16n)).toBe('0.01')
    expect(formatOg(9n * 10n ** 16n)).toBe('0.09')
  })

  it('strips trailing zeros without losing precision', () => {
    expect(formatOg('1500000000000000000')).toBe('1.5')
    expect(formatOg('1')).toBe('0.000000000000000001')
  })

  it('accepts strings, which is how neuron amounts cross JSON', () => {
    expect(formatOg('500000000000')).toBe('0.0000005')
  })

  it('reconciles the documented price per million tokens', () => {
    // mainnet: 500_000_000_000 neuron/token × 1e6 tokens = 0.5 0G per million.
    expect(formatOg(500_000_000_000n * 1_000_000n)).toBe('0.5')
  })
})

describe('formatBytes', () => {
  it('renders a LoRA adapter in MB', () => {
    expect(formatBytes(104_857_600)).toBe('100 MB')
    expect(formatBytes(943_718_400)).toBe('900 MB')
  })

  it('handles small and invalid values', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('states hours without folding them into days', () => {
    // The acknowledgement window is stated in hours; "1d 23h" makes the reader
    // do arithmetic to check it against the rule.
    expect(formatDuration(47 * 3600_000 + 12 * 60_000 + 3_000)).toBe('47h 12m 03s')
  })

  it('drops empty leading units', () => {
    expect(formatDuration(65_000)).toBe('1m 05s')
    expect(formatDuration(9_000)).toBe('9s')
  })

  it('clamps negatives to zero rather than showing a negative clock', () => {
    expect(formatDuration(-5_000)).toBe('0s')
  })
})

describe('formatElapsed', () => {
  it('renders compact durations', () => {
    expect(formatElapsed(45)).toBe('45s')
    expect(formatElapsed(600)).toBe('10m')
    expect(formatElapsed(3_900)).toBe('1h 5m')
  })
})

describe('formatLearningRate', () => {
  it('never renders exponent notation, which 0G rejects', () => {
    expect(formatLearningRate(0.0002)).toBe('0.0002')
    expect(formatLearningRate(0.00001)).toBe('0.00001')
    expect(String(2e-4)).toBe('0.0002')
    expect(formatLearningRate(0.0002)).not.toContain('e')
  })
})
