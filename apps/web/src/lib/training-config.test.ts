import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONFIG,
  PARAMETER_SPECS,
  TEMPLATE_PARAMETERS,
  validateTrainingConfig,
} from './training-config'

describe('validateTrainingConfig', () => {
  it('accepts the config 0G’s own example ships', () => {
    expect(validateTrainingConfig({ ...DEFAULT_CONFIG })).toEqual([])
  })

  it('rejects extra parameters, which 0G refuses after funding', () => {
    const issues = validateTrainingConfig({ ...DEFAULT_CONFIG, warmup_steps: 10 })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('Unexpected parameter "warmup_steps"')
  })

  it('rejects missing parameters', () => {
    const { max_steps: _dropped, ...partial } = DEFAULT_CONFIG
    const issues = validateTrainingConfig(partial)
    expect(issues.some((i) => i.message.includes('Missing parameter "max_steps"'))).toBe(true)
  })

  it('enforces each documented range', () => {
    const cases: Array<[Partial<Record<string, number>>, string]> = [
      [{ neftune_noise_alpha: 11 }, 'between 0 and 10'],
      [{ num_train_epochs: 0 }, 'positive integer'],
      [{ num_train_epochs: 1.5 }, 'positive integer'],
      [{ per_device_train_batch_size: 5 }, 'between 1 and 4'],
      [{ learning_rate: 0.01 }, 'between 0.00001 and 0.001'],
      [{ learning_rate: 0.000001 }, 'between 0.00001 and 0.001'],
      [{ max_steps: 0 }, '-1 (use epochs) or a positive integer'],
    ]

    for (const [override, expected] of cases) {
      const issues = validateTrainingConfig({ ...DEFAULT_CONFIG, ...override })
      expect(issues.map((i) => i.message).join(' | ')).toContain(expected)
    }
  })

  it('accepts -1 for max_steps', () => {
    expect(validateTrainingConfig({ ...DEFAULT_CONFIG, max_steps: -1 })).toEqual([])
  })

  it('attaches the offending key so the form can highlight the right field', () => {
    const issues = validateTrainingConfig({ ...DEFAULT_CONFIG, per_device_train_batch_size: 9 })
    expect(issues[0]!.key).toBe('per_device_train_batch_size')
  })

  it('suggests the fix for a batch size that will run out of memory', () => {
    const issues = validateTrainingConfig({ ...DEFAULT_CONFIG, per_device_train_batch_size: 4.5 })
    expect(issues[0]!.message).toContain('Reduce to 1')
  })
})

describe('PARAMETER_SPECS', () => {
  it('covers exactly the five parameters 0G accepts', () => {
    expect(PARAMETER_SPECS.map((spec) => spec.key)).toEqual([...TEMPLATE_PARAMETERS])
  })

  it('gives every parameter usable help text', () => {
    for (const spec of PARAMETER_SPECS) {
      expect(spec.help.length).toBeGreaterThan(10)
    }
  })

  it('marks -1 as a sentinel on max_steps rather than a range value', () => {
    const maxSteps = PARAMETER_SPECS.find((s) => s.key === 'max_steps')!
    expect(maxSteps.sentinel).toEqual({ value: -1, label: 'use epochs' })
  })
})

describe('DEFAULT_CONFIG', () => {
  it('uses 0G’s shipped working values, not the docs template', () => {
    // docs say epochs 1 / max_steps 3; the example that actually runs says 3/45.
    expect(DEFAULT_CONFIG.num_train_epochs).toBe(3)
    expect(DEFAULT_CONFIG.max_steps).toBe(45)
  })

  it('writes the learning rate in decimal notation', () => {
    expect(String(DEFAULT_CONFIG.learning_rate)).not.toContain('e')
  })
})
