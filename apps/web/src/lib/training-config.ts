/**
 * Training-config validation (INTERFACES.md §3).
 *
 * 0G's broker accepts exactly five parameters and rejects anything else. The
 * rejection surfaces late — after a task has been created and funded — so the
 * form catches it first.
 */

import type { TrainingConfig } from './types'

export const TEMPLATE_PARAMETERS = [
  'neftune_noise_alpha',
  'num_train_epochs',
  'per_device_train_batch_size',
  'learning_rate',
  'max_steps',
] as const

export type TrainingParameter = (typeof TEMPLATE_PARAMETERS)[number]

/**
 * The config 0G's own example repo actually ships and runs, not the docs'
 * template (which uses `num_train_epochs: 1, max_steps: 3`). The discrepancy is
 * recorded in docs/FIELD_NOTES.md; we default to the one known to work.
 */
export const DEFAULT_CONFIG: TrainingConfig = {
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 45,
}

export interface ParameterSpec {
  key: TrainingParameter
  label: string
  help: string
  min: number
  max: number
  step: number
  integer: boolean
  /** `max_steps` accepts -1 as "use epochs instead". */
  sentinel?: { value: number; label: string }
}

export const PARAMETER_SPECS: ParameterSpec[] = [
  {
    key: 'neftune_noise_alpha',
    label: 'neftune_noise_alpha',
    help: 'Embedding noise during training. Higher can improve instruction-following on small datasets.',
    min: 0,
    max: 10,
    step: 1,
    integer: false,
  },
  {
    key: 'num_train_epochs',
    label: 'num_train_epochs',
    help: 'Passes over the dataset. Multiplies the training fee linearly.',
    min: 1,
    max: 20,
    step: 1,
    integer: true,
  },
  {
    key: 'per_device_train_batch_size',
    label: 'per_device_train_batch_size',
    help: '1–4. Drop to 1 if the run hits out-of-memory on the H200.',
    min: 1,
    max: 4,
    step: 1,
    integer: true,
  },
  {
    key: 'learning_rate',
    label: 'learning_rate',
    help: '0.00001–0.001. Decimal notation only — 0G rejects 2e-4.',
    min: 0.00001,
    max: 0.001,
    step: 0.00001,
    integer: false,
  },
  {
    key: 'max_steps',
    label: 'max_steps',
    help: 'Hard cap on optimiser steps. -1 means "run the full epochs".',
    min: -1,
    max: 5000,
    step: 1,
    integer: true,
    sentinel: { value: -1, label: 'use epochs' },
  },
]

export interface ConfigIssue {
  key?: TrainingParameter | string
  message: string
}

const isPositiveInteger = (v: number) => Number.isInteger(v) && v > 0

export function validateTrainingConfig(config: Record<string, unknown>): ConfigIssue[] {
  const issues: ConfigIssue[] = []

  for (const key of Object.keys(config)) {
    if (!(TEMPLATE_PARAMETERS as readonly string[]).includes(key)) {
      issues.push({
        key,
        message: `Unexpected parameter "${key}". 0G rejects configs with extra parameters — use the standard template exactly.`,
      })
    }
  }

  for (const key of TEMPLATE_PARAMETERS) {
    if (!(key in config)) {
      issues.push({
        key,
        message: `Missing parameter "${key}". 0G requires all five template parameters to be present.`,
      })
    }
  }

  const num = (key: TrainingParameter): number | undefined => {
    const v = config[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }

  const alpha = num('neftune_noise_alpha')
  if (alpha !== undefined && (alpha < 0 || alpha > 10)) {
    issues.push({
      key: 'neftune_noise_alpha',
      message: `Must be between 0 and 10, got ${alpha}.`,
    })
  }

  const epochs = num('num_train_epochs')
  if (epochs !== undefined && !isPositiveInteger(epochs)) {
    issues.push({
      key: 'num_train_epochs',
      message: `Must be a positive integer, got ${epochs}.`,
    })
  }

  const batch = num('per_device_train_batch_size')
  if (batch !== undefined && (batch < 1 || batch > 4)) {
    issues.push({
      key: 'per_device_train_batch_size',
      message: `Must be between 1 and 4, got ${batch}. Reduce to 1 if you hit out-of-memory errors.`,
    })
  }

  const lr = num('learning_rate')
  if (lr !== undefined && (lr < 0.00001 || lr > 0.001)) {
    issues.push({
      key: 'learning_rate',
      message: `Must be between 0.00001 and 0.001, got ${lr}.`,
    })
  }

  const steps = num('max_steps')
  if (steps !== undefined && steps !== -1 && !isPositiveInteger(steps)) {
    issues.push({
      key: 'max_steps',
      message: `Must be -1 (use epochs) or a positive integer, got ${steps}.`,
    })
  }

  return issues
}
