import { describe, expect, it } from 'vitest'

import { MINIMUM_EXAMPLES, analyseJsonl, detectFormat, estimateTokens } from './dataset'
import { BROKEN_DATASET, SAMPLE_DATASET } from './sample-dataset'

const chat = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      messages: [
        { role: 'user', content: `question ${i}` },
        { role: 'assistant', content: `answer ${i}` },
      ],
    }),
  ).join('\n')

const instruction = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    JSON.stringify({ instruction: `do ${i}`, input: '', output: `done ${i}` }),
  ).join('\n')

describe('detectFormat', () => {
  it('recognises 0G’s three formats', () => {
    expect(detectFormat({ messages: [{ role: 'user', content: 'hi' }] })).toBe('chat')
    expect(detectFormat({ instruction: 'a', input: '', output: 'b' })).toBe('instruction')
    expect(detectFormat({ text: 'raw' })).toBe('text')
  })

  it('treats an absent input as valid instruction format', () => {
    expect(detectFormat({ instruction: 'a', output: 'b' })).toBe('instruction')
  })

  it('rejects anything else', () => {
    expect(detectFormat({ prompt: 'a', completion: 'b' })).toBeNull()
    expect(detectFormat({ messages: [] })).toBeNull()
    expect(detectFormat({ messages: [{ role: 'user' }] })).toBeNull()
    expect(detectFormat('a string')).toBeNull()
    expect(detectFormat(null)).toBeNull()
    expect(detectFormat([1, 2, 3])).toBeNull()
  })
})

describe('analyseJsonl', () => {
  it('accepts a well-formed chat dataset', () => {
    const result = analyseJsonl(chat(30))
    expect(result.valid).toBe(true)
    expect(result.format).toBe('chat')
    expect(result.exampleCount).toBe(30)
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('accepts the bundled sample dataset', () => {
    const result = analyseJsonl(SAMPLE_DATASET)
    expect(result.valid).toBe(true)
    expect(result.format).toBe('chat')
    expect(result.exampleCount).toBe(30)
  })

  it('tolerates a single trailing newline, which is correct JSONL', () => {
    const result = analyseJsonl(`${chat(12)}\n`)
    expect(result.valid).toBe(true)
    expect(result.exampleCount).toBe(12)
  })

  it('rejects a dataset below 0G’s minimum, and says how many are missing', () => {
    const result = analyseJsonl(chat(4))
    expect(result.valid).toBe(false)

    const issue = result.issues.find((i) => i.message.includes('at least'))
    expect(issue).toBeDefined()
    expect(issue!.message).toContain('4 valid examples')
    expect(issue!.message).toContain(String(MINIMUM_EXAMPLES))
    expect(issue!.fix).toContain('Add 6 more')
  })

  it('warns — but does not reject — a dataset below the recommended size', () => {
    const result = analyseJsonl(chat(30))
    const warning = result.issues.find((i) => i.severity === 'warning')
    expect(warning).toBeDefined()
    expect(warning!.message).toContain('above 0G’s minimum')
    expect(result.valid).toBe(true)
  })

  it('reports mixed formats with the line of the odd record out', () => {
    const source = `${chat(12)}\n${instruction(1)}`
    const result = analyseJsonl(source)

    expect(result.valid).toBe(false)
    const issue = result.issues.find((i) => i.message.includes('mixes formats'))
    expect(issue).toBeDefined()
    expect(issue!.message).toContain('chat (12 records)')
    expect(issue!.message).toContain('instruction (1 record)')
    expect(issue!.line).toBe(13)
    expect(issue!.fix).toContain('Line 13')
  })

  it('reports blank lines inside the file, which 0G rejects', () => {
    const lines = chat(12).split('\n')
    lines.splice(5, 0, '')
    const result = analyseJsonl(lines.join('\n'))

    const issue = result.issues.find((i) => i.message.includes('Blank line'))
    expect(issue).toBeDefined()
    expect(issue!.line).toBe(6)
    expect(result.valid).toBe(false)
  })

  it('reports unparseable JSON with its line number', () => {
    const lines = chat(12).split('\n')
    lines[3] = '{"messages":[{"role":"user"'
    const result = analyseJsonl(lines.join('\n'))

    const issue = result.issues.find((i) => i.message.includes('Not valid JSON'))
    expect(issue).toBeDefined()
    expect(issue!.line).toBe(4)
    expect(issue!.fix).toContain('one complete JSON object')
  })

  it('names the first few unrecognised lines and then summarises', () => {
    const bad = Array.from({ length: 12 }, () => JSON.stringify({ prompt: 'x', completion: 'y' }))
    const result = analyseJsonl(bad.join('\n'))

    const named = result.issues.filter((i) => i.message.includes('none of 0G’s three formats'))
    expect(named).toHaveLength(5)

    const summary = result.issues.find((i) => i.message.includes('more unrecognised lines'))
    expect(summary).toBeDefined()
    expect(summary!.message).toContain('12 of 12 records')
  })

  it('rejects an empty file with a useful message', () => {
    const result = analyseJsonl('   \n  ')
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('no records'))).toBe(true)
  })

  it('catches every problem in the deliberately broken sample at once', () => {
    const result = analyseJsonl(BROKEN_DATASET)
    expect(result.valid).toBe(false)

    const messages = result.issues.map((i) => i.message).join(' | ')
    expect(messages).toContain('Blank line')
    expect(messages).toContain('Not valid JSON')
    expect(messages).toContain('none of 0G’s three formats')
    expect(messages).toContain('mixes formats')
  })

  it('estimates tokens from the trainable text only', () => {
    const result = analyseJsonl(chat(10))
    expect(result.tokenCount).toBeGreaterThan(0)
    // 10 records × "question N answer N" ≈ 19 chars → ~5 tokens each.
    expect(result.tokenCount).toBeLessThan(200)
  })
})

describe('estimateTokens', () => {
  it('uses roughly four characters per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateTokens('')).toBe(0)
  })
})
