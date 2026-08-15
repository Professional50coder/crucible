import { describe, expect, test } from 'vitest'
import { validateDatasetFile } from '../src/dataset.js'

const chatLine = JSON.stringify({
  messages: [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ],
})

/** A minimal well-formed file: 10 identical chat records, LF, trailing newline. */
const validFile = Array.from({ length: 10 }, () => chatLine).join('\n') + '\n'

describe('validateDatasetFile', () => {
  test('accepts a well-formed JSONL file', () => {
    expect(validateDatasetFile(validFile)).toEqual([])
  })

  // The gap this whole module exists to close: JSON.parse tolerates a trailing
  // \r, so a CRLF file passes record-level validation and reaches 0G unflagged.
  // On Windows this is the default line ending, so it is a live risk.
  test('rejects CRLF line endings, which record-level validation cannot see', () => {
    const crlf = validFile.replace(/\n/g, '\r\n')

    expect(validateDatasetFile(crlf)).toContain(
      'File uses CRLF line endings. 0G requires LF line endings only - JSON.parse ' +
        'silently tolerates the trailing carriage return, so this survives ' +
        'record-level validation.',
    )
  })

  test('rejects a UTF-8 BOM', () => {
    expect(validateDatasetFile('﻿' + validFile)).toContain(
      'File starts with a UTF-8 BOM. Strip it — 0G requires clean UTF-8.',
    )
  })

  test('rejects a blank line between records', () => {
    const withBlank = validFile.replace('\n', '\n\n')

    expect(validateDatasetFile(withBlank)).toContain(
      'Line 2 is blank. 0G rejects blank lines between records.',
    )
  })

  test('rejects a JSON array masquerading as JSONL', () => {
    const asArray = '[' + Array.from({ length: 10 }, () => chatLine).join(',') + ']\n'

    expect(validateDatasetFile(asArray)).toContain(
      'File looks like a JSON array. JSONL requires one JSON object per line.',
    )
  })

  test('names the line when one line is not valid JSON', () => {
    const broken = validFile.replace(chatLine, '{"messages": [') // first line only

    expect(validateDatasetFile(broken)).toContain('Line 1 is not valid JSON.')
  })

  test('rejects an empty file', () => {
    expect(validateDatasetFile('')).toEqual(['File is empty.'])
  })

  test('still applies the record-level rules', () => {
    const tooFew = Array.from({ length: 9 }, () => chatLine).join('\n') + '\n'

    expect(validateDatasetFile(tooFew)).toContain(
      'Dataset has 9 examples. 0G requires at least 10.',
    )
  })

  test('tolerates a missing final newline, since it changes no record', () => {
    expect(validateDatasetFile(validFile.trimEnd())).toEqual([])
  })
})
