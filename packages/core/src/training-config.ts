/**
 * Validation for 0G Compute fine-tuning training configs.
 *
 * 0G's broker accepts exactly five parameters and rejects anything else. The
 * failure surfaces late — after a task has been created and funded — so we
 * catch it locally first.
 *
 * Rules and ranges from docs.0g.ai "Prepare Configuration File".
 */

export interface TrainingConfig {
  neftune_noise_alpha: number
  num_train_epochs: number
  per_device_train_batch_size: number
  learning_rate: number
  max_steps: number
}

export const TEMPLATE_PARAMETERS = [
  'neftune_noise_alpha',
  'num_train_epochs',
  'per_device_train_batch_size',
  'learning_rate',
  'max_steps',
] as const

/** The template as published in the 0G docs. */
export const STANDARD_TEMPLATE: TrainingConfig = {
  neftune_noise_alpha: 5,
  num_train_epochs: 1,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 3,
}

const isPositiveInteger = (v: number) => Number.isInteger(v) && v > 0

export function validateTrainingConfig(config: Record<string, unknown>): string[] {
  const errors: string[] = []

  for (const key of Object.keys(config)) {
    if (!(TEMPLATE_PARAMETERS as readonly string[]).includes(key)) {
      errors.push(
        `Unexpected parameter "${key}". 0G rejects configs with extra parameters — use the standard template exactly.`,
      )
    }
  }

  for (const key of TEMPLATE_PARAMETERS) {
    if (!(key in config)) {
      errors.push(
        `Missing parameter "${key}". 0G requires all five template parameters to be present.`,
      )
    }
  }

  const num = (key: keyof TrainingConfig): number | undefined => {
    const v = config[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }

  const alpha = num('neftune_noise_alpha')
  if (alpha !== undefined && (alpha < 0 || alpha > 10)) {
    errors.push(`"neftune_noise_alpha" must be between 0 and 10, got ${alpha}.`)
  }

  const epochs = num('num_train_epochs')
  if (epochs !== undefined && !isPositiveInteger(epochs)) {
    errors.push(`"num_train_epochs" must be a positive integer, got ${epochs}.`)
  }

  const batch = num('per_device_train_batch_size')
  if (batch !== undefined && (batch < 1 || batch > 4)) {
    errors.push(
      `"per_device_train_batch_size" must be between 1 and 4, got ${batch}. Reduce to 1 if you hit out-of-memory errors.`,
    )
  }

  const lr = num('learning_rate')
  if (lr !== undefined && (lr < 0.00001 || lr > 0.001)) {
    errors.push(`"learning_rate" must be between 0.00001 and 0.001, got ${lr}.`)
  }

  const steps = num('max_steps')
  if (steps !== undefined && steps !== -1 && !isPositiveInteger(steps)) {
    errors.push(`"max_steps" must be -1 (use epochs) or a positive integer, got ${steps}.`)
  }

  return errors
}
