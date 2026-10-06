import { describe, expect, test } from 'vitest'
import { validateDatasetFile, validateTrainingConfig } from '@crucible/core'
import { parseArgs } from '../src/cli.js'
import { initCommand, scaffoldTargetProblem } from '../src/commands.js'

const file = (name: string): string => {
  const f = initCommand('demo').files.find((x) => x.path === name)
  if (f === undefined) throw new Error(`missing ${name}`)
  return f.content
}

describe('initCommand', () => {
  test('writes the five expected files', () => {
    expect(initCommand('demo').files.map((f) => f.path).sort()).toEqual(
      ['.env.example', '.gitignore', 'README.md', 'config.json', 'dataset.jsonl'].sort(),
    )
  })

  test('the dataset passes validateDatasetFile and has at least 10 examples', () => {
    const content = file('dataset.jsonl')
    expect(validateDatasetFile(content)).toEqual([])
    expect(content.trim().split('\n').length).toBeGreaterThanOrEqual(10)
  })

  test('the config passes validateTrainingConfig', () => {
    expect(validateTrainingConfig(JSON.parse(file('config.json')))).toEqual([])
  })

  test('.gitignore covers .env and *.key', () => {
    const lines = file('.gitignore').split('\n')
    expect(lines).toContain('.env')
    expect(lines).toContain('*.key')
  })

  test('no file contains anything resembling a real key or secret', () => {
    for (const f of initCommand('demo').files) {
      expect(f.content, f.path).not.toMatch(/0x[0-9a-fA-F]{64}/)
      expect(f.content, f.path).not.toMatch(/\b[0-9a-fA-F]{64}\b/)
      expect(f.content, f.path).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/)
    }
    expect(file('.env.example')).toContain('PRIVATE_KEY=<your-wallet-private-key>')
  })

  test('is deterministic', () => {
    expect(initCommand('demo')).toEqual(initCommand('demo'))
  })
})

describe('scaffoldTargetProblem', () => {
  test('a missing or empty directory is fine', () => {
    expect(scaffoldTargetProblem('d', undefined)).toBeUndefined()
    expect(scaffoldTargetProblem('d', [])).toBeUndefined()
  })

  test('a non-empty directory is refused', () => {
    expect(scaffoldTargetProblem('d', ['x.txt'])).toMatch(/not empty/)
  })
})

describe('parseArgs init', () => {
  test('init takes a directory', () => {
    expect(parseArgs(['init', 'my-proj'])).toEqual({ kind: 'init', dir: 'my-proj' })
  })

  test('init without a directory is an error', () => {
    expect(parseArgs(['init'])).toMatchObject({ kind: 'error' })
  })
})
