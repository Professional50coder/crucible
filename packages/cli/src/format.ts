/**
 * Terminal styling, shared by every command.
 *
 * Split out of index.ts so the command modules stay pure functions over strings
 * — a function that returns lines can be asserted on; one that writes straight
 * to stdout cannot.
 */

export const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
}

export const ok = c.green('✓')
export const bad = c.red('✗')
export const warn = c.yellow('!')

/** Strip ANSI escapes. Tests assert on content, not on colour codes. */
export function plain(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
