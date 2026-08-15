import { describe, expect, test } from 'vitest'
import { validateTrainingConfig } from '../src/training-config.js'

const VALID = {
  neftune_noise_alpha: 5,
  num_train_epochs: 1,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 3,
}

describe('validateTrainingConfig', () => {
  test('accepts the standard template from the 0G docs', () => {
    expect(validateTrainingConfig(VALID)).toEqual([])
  })

  test('accepts the config shipped in 0G fine-tuning-example', () => {
    expect(
      validateTrainingConfig({ ...VALID, num_train_epochs: 3, max_steps: 45 }),
    ).toEqual([])
  })

  test('rejects a config containing an extra parameter', () => {
    const errors = validateTrainingConfig({ ...VALID, fp16: true })

    expect(errors).toEqual([
      'Unexpected parameter "fp16". 0G rejects configs with extra parameters — use the standard template exactly.',
    ])
  })

  test('rejects a config with a parameter removed', () => {
    const { max_steps, ...withoutMaxSteps } = VALID

    expect(validateTrainingConfig(withoutMaxSteps)).toEqual([
      'Missing parameter "max_steps". 0G requires all five template parameters to be present.',
    ])
  })

  test('rejects neftune_noise_alpha above 10', () => {
    expect(validateTrainingConfig({ ...VALID, neftune_noise_alpha: 11 })).toEqual([
      '"neftune_noise_alpha" must be between 0 and 10, got 11.',
    ])
  })

  test('rejects a batch size above 4', () => {
    expect(validateTrainingConfig({ ...VALID, per_device_train_batch_size: 8 })).toEqual([
      '"per_device_train_batch_size" must be between 1 and 4, got 8. Reduce to 1 if you hit out-of-memory errors.',
    ])
  })

  test('rejects a learning rate outside the documented range', () => {
    expect(validateTrainingConfig({ ...VALID, learning_rate: 0.01 })).toEqual([
      '"learning_rate" must be between 0.00001 and 0.001, got 0.01.',
    ])
  })

  test('rejects a non-integer epoch count', () => {
    expect(validateTrainingConfig({ ...VALID, num_train_epochs: 1.5 })).toEqual([
      '"num_train_epochs" must be a positive integer, got 1.5.',
    ])
  })

  test('accepts max_steps of -1, which means "use epochs instead"', () => {
    expect(validateTrainingConfig({ ...VALID, max_steps: -1 })).toEqual([])
  })

  test('rejects max_steps of 0, which is neither -1 nor positive', () => {
    expect(validateTrainingConfig({ ...VALID, max_steps: 0 })).toEqual([
      '"max_steps" must be -1 (use epochs) or a positive integer, got 0.',
    ])
  })

  test('reports every problem at once rather than stopping at the first', () => {
    const errors = validateTrainingConfig({
      ...VALID,
      per_device_train_batch_size: 8,
      learning_rate: 0.01,
      bf16: false,
    })

    expect(errors).toHaveLength(3)
  })
})
