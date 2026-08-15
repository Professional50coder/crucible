#!/usr/bin/env node
/**
 * Copy the generated Passport ABI into the web app.
 *
 * The web app is a standalone project — it must not reach across package
 * boundaries at build time — so the ABI lives there as a literal rather than an
 * import. That means it can drift, which is exactly what this script exists to
 * prevent. Run it after any `npm run export-abi` in contracts/.
 *
 *   node tools/sync-abi.mjs           # write
 *   node tools/sync-abi.mjs --check   # verify only; non-zero exit if stale (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'contracts/abi/Passport.json'
const TARGET = 'apps/web/src/lib/passport-abi.ts'

const raw = JSON.parse(readFileSync(SOURCE, 'utf8'))
const abi = Array.isArray(raw) ? raw : raw.abi

const header = [
  '/**',
  ' * `Passport.sol` ABI — GENERATED. Do not hand-edit.',
  ' *',
  ' * Source of truth: `contracts/abi/Passport.json`.',
  ' * Regenerate there (`npm run export-abi`), then run `node tools/sync-abi.mjs`.',
  ' * `node tools/sync-abi.mjs --check` fails if this file has drifted.',
  ' *',
  ' * It is a literal rather than an import because the web app is a standalone',
  ' * project and must not reach across package boundaries at build time.',
  ' *',
  ' * The two calls a stranger needs are `passportOf` and `verifyManifest`. Neither',
  ' * requires a wallet — that is what makes a passport checkable by someone who',
  ' * does not trust whoever minted it.',
  ' */',
  '',
  `export const PASSPORT_ABI = ${JSON.stringify(abi, null, 2)} as const`,
  '',
].join('\n')

if (process.argv.includes('--check')) {
  const current = readFileSync(TARGET, 'utf8')
  if (current !== header) {
    console.error(`✗ ${TARGET} is out of sync with ${SOURCE}. Run: node tools/sync-abi.mjs`)
    process.exit(1)
  }
  console.log(`✓ ${TARGET} matches ${SOURCE} (${abi.length} entries)`)
} else {
  writeFileSync(TARGET, header)
  console.log(`✓ wrote ${abi.length} ABI entries → ${TARGET}`)
}
