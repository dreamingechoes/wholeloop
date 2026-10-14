import { VERSION } from '../version.js'
import { docsCheck, docsNav } from './docs.js'
import { harnessCheck } from './harness.js'
import { EXIT, type Io } from './io.js'

export { EXIT, type Io } from './io.js'

const USAGE = `wholeloop ${VERSION} — a CLI-agnostic AI development harness

Usage: wl <command> [options]

Options:
  -v, --version   Print the version
  -h, --help      Print this help

Contributor commands:
  docs nav        Rewrite every docnav footer from docs/nav.yml
  docs check      Check docnav, nav listing, status banners, links and anchors (--json)
  harness check   Check size budgets, front matter and the enforcement map (--json)

Flow commands arrive with the walking skeleton (roadmap P1).`

export function run(argv: readonly string[], io: Io, root = process.cwd()): number {
  const [first, second, ...rest] = argv
  if (first === '--version' || first === '-v') {
    io.out(VERSION)
    return EXIT.ok
  }
  if (first === undefined || first === '--help' || first === '-h') {
    io.out(USAGE)
    return EXIT.ok
  }
  if (first === 'docs' && second === 'nav') return docsNav(root, io)
  if (first === 'docs' && second === 'check') return docsCheck(root, rest.includes('--json'), io)
  if (first === 'harness' && second === 'check') {
    return harnessCheck(root, rest.includes('--json'), io)
  }
  io.err(`wl: unknown command or option '${argv.join(' ')}'. Run 'wl --help'.`)
  return EXIT.unexpected
}
