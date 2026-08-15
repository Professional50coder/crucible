/**
 * @crucible/ml — the AI/ML intelligence layer for Crucible.
 *
 * Two halves:
 *
 *   eval/    — after a fine-tune, run base and tuned models over the held-out set
 *              and produce a comparison that states its own uncertainty.
 *   analyze/ — before any money is spent, tell the user what is wrong with their
 *              dataset.
 *
 * plus passport-ext, which turns either result into an optional manifest section.
 */

export * from './eval/index.js'
export * from './analyze/index.js'
export * from './passport-ext.js'
