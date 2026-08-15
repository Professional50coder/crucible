/**
 * Deployed `Passport.sol` addresses — configuration, not ABI.
 *
 * Kept separate from `passport-abi.ts` because that file is generated from
 * `contracts/abi/Passport.json` and is overwritten wholesale by
 * `tools/sync-abi.mjs`. Anything hand-maintained must live outside it.
 *
 * Addresses are per-network and are supplied at build time. Until Phase 3
 * deploys, these are empty — and the UI must say "not yet deployed" rather than
 * render a plausible-looking address, because a passport page whose contract
 * link goes nowhere reads as a fabricated claim, not a missing config value.
 */

import type { Network } from './types'

/**
 * Set at build time, per network:
 *   NEXT_PUBLIC_PASSPORT_ADDRESS_TESTNET=0x...
 *   NEXT_PUBLIC_PASSPORT_ADDRESS_MAINNET=0x...
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` statically, so these must be
 * referenced as full literals — destructuring or dynamic keys will not work.
 */
export const PASSPORT_ADDRESSES: Record<Network, string> = {
  testnet: process.env.NEXT_PUBLIC_PASSPORT_ADDRESS_TESTNET?.trim() ?? '',
  mainnet: process.env.NEXT_PUBLIC_PASSPORT_ADDRESS_MAINNET?.trim() ?? '',
}

/** The address for a network, or `''` when it has not been deployed there yet. */
export function passportAddress(network: Network): string {
  return PASSPORT_ADDRESSES[network] ?? ''
}

/** Whether a real deployment exists for this network. */
export function isDeployed(network: Network): boolean {
  return passportAddress(network) !== ''
}

/**
 * Back-compat single-address export.
 *
 * @deprecated Prefer `passportAddress(network)`. A single global address is
 * wrong for a two-network app: showing a mainnet address next to testnet
 * provenance would misdirect anyone trying to verify it.
 */
export const PASSPORT_ADDRESS: string =
  PASSPORT_ADDRESSES.mainnet || PASSPORT_ADDRESSES.testnet
