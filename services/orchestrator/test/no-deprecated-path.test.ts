import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/**
 * The Bug #4 trigger, enforced structurally rather than by discipline.
 *
 * `downloadModelFrom0GStorage` + `decryptModel` without acknowledging is what
 * permanently locks a user's deliverable queue. It must be impossible to reach
 * from this codebase, not merely discouraged.
 */
describe('the deprecated queue-locking path', () => {
  const files = sourceFiles(srcDir)

  it('finds source files to check (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it('is never invoked anywhere in src/', () => {
    const offenders: string[] = []
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      // Call syntax only — the names appear in explanatory comments on purpose.
      if (/\.\s*downloadModelFrom0GStorage\s*\(/.test(code)) offenders.push(`${file}: downloadModelFrom0GStorage()`)
      if (/\.\s*decryptModel\s*\(/.test(code)) offenders.push(`${file}: decryptModel()`)
    }
    expect(offenders).toEqual([])
  })

  it('is not even present on the broker port, so it cannot be called by mistake', () => {
    const port = readFileSync(join(srcDir, 'broker.ts'), 'utf8')
    const portBlock = port.slice(
      port.indexOf('export interface FineTuningPort'),
      port.indexOf('/** Errors that mean'),
    )
    expect(portBlock).not.toContain('downloadModelFrom0GStorage')
    expect(portBlock).not.toContain('decryptModel')
    // ...while the safe call it replaces IS on the port.
    expect(portBlock).toContain('acknowledgeModel')
    expect(portBlock).toContain('acknowledgeDeliverable')
  })
})
