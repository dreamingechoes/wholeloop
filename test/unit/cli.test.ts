import { describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }
import { EXIT, type Io, run } from '../../src/cli/main.js'

function capture(): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return { stdout, stderr, out: (t) => stdout.push(t), err: (t) => stderr.push(t) }
}

describe('wl', () => {
  it.each([['--version'], ['-v']])('%s prints the package version', (flag) => {
    const io = capture()
    expect(run([flag], io)).toBe(EXIT.ok)
    expect(io.stdout).toEqual([pkg.version])
  })

  it.each([[[]], [['--help']], [['-h']]])('%j prints usage', (argv) => {
    const io = capture()
    expect(run(argv, io)).toBe(EXIT.ok)
    expect(io.stdout[0]).toMatch(/^wholeloop .+\n\nUsage: wl <command>/)
  })

  it('rejects an unknown command on stderr with a non-zero exit', () => {
    const io = capture()
    expect(run(['frobnicate'], io)).toBe(EXIT.unexpected)
    expect(io.stdout).toEqual([])
    expect(io.stderr[0]).toContain("unknown command or option 'frobnicate'")
  })
})
