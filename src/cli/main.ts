import { VERSION } from '../version.js'

export interface Io {
  out: (text: string) => void
  err: (text: string) => void
}

export const EXIT = {
  ok: 0,
  unexpected: 1,
} as const

const USAGE = `wholeloop ${VERSION} — a CLI-agnostic AI development harness

Usage: wl <command> [options]

Options:
  -v, --version   Print the version
  -h, --help      Print this help

Commands arrive with the walking skeleton (roadmap P1).`

export function run(argv: readonly string[], io: Io): number {
  const [first] = argv
  if (first === '--version' || first === '-v') {
    io.out(VERSION)
    return EXIT.ok
  }
  if (first === undefined || first === '--help' || first === '-h') {
    io.out(USAGE)
    return EXIT.ok
  }
  io.err(`wl: unknown command or option '${first}'. Run 'wl --help'.`)
  return EXIT.unexpected
}
