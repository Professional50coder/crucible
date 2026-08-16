#!/usr/bin/env node
/**
 * Which local file is this dataset root hash?
 *
 * A passport records `datasetRootHash`, and until now nothing in this repository
 * could turn that hash back into a file you can open. That gap matters: the whole
 * claim is that a passport is checkable, and a hash nobody can resolve is not.
 *
 * Recomputes the 0G Storage merkle root of every candidate .jsonl and compares.
 * Read-only, offline, spends nothing, sends nothing.
 *
 *   node tools/identify-dataset.mjs                       # against the anchored root
 *   node tools/identify-dataset.mjs 0x<root>              # against any root
 *   node tools/identify-dataset.mjs 0x<root> datasets/foo # against a chosen tree
 *
 * Exit code 0 if the root was matched, 1 if nothing matched.
 */
import { readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { ZgFile } from '@0gfoundation/0g-storage-ts-sdk'

/** The root anchored in passports #1 and #2, uploaded 2026-08-14. */
const ANCHORED = '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd'

const target = (process.argv[2] ?? ANCHORED).toLowerCase()
const root = process.argv[3] ?? 'datasets'

function collect(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...collect(full))
    else if (extname(full) === '.jsonl') found.push(full)
  }
  return found.sort()
}

const files = collect(root)
if (files.length === 0) {
  console.error(`No .jsonl files under ${root}`)
  process.exit(1)
}

console.log(`looking for ${target}`)
console.log(`across ${files.length} file(s) under ${root}/\n`)

let matched = null
for (const path of files) {
  const size = statSync(path).size
  let hash
  try {
    const file = await ZgFile.fromFilePath(path)
    const [tree, err] = await file.merkleTree()
    await file.close()
    if (err) throw err
    hash = String(tree.rootHash()).toLowerCase()
  } catch (error) {
    console.log(`  ??  ${relative(process.cwd(), path)} — ${error.message ?? error}`)
    continue
  }

  const hit = hash === target
  if (hit) matched = path
  console.log(`  ${hit ? '>>' : '  '}  ${relative(process.cwd(), path).padEnd(34)} ${hash}  ${size} bytes`)
}

console.log()
if (matched) {
  console.log(`MATCH: ${relative(process.cwd(), matched)}`)
  process.exit(0)
}
console.log('No local file produces that root. It was uploaded from a file not in this tree,')
console.log('or the file has changed since.')
process.exit(1)
