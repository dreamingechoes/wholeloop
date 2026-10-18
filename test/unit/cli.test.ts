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

describe('versioned command framework', () => {
  it('exports the documented exit-code contract', () => {
    expect(EXIT).toEqual({ ok: 0, unexpected: 1, input: 2, precondition: 3, shape: 4 })
  })
  it.each([
    { args: ['--version'], code: 0, schema: 'version' },
    { args: ['--help'], code: 0, schema: 'help' },
    { args: ['missing'], code: 1, schema: 'error' },
    { args: ['docs', 'check', '--typo'], code: 4, schema: 'error' },
  ])('returns versioned JSON for $args', ({ args, code, schema }) => {
    const io = capture()
    expect(run([...args, '--json'], io)).toBe(code)
    expect(io.stderr).toEqual([])
    expect(io.stdout).toHaveLength(1)
    expect(JSON.parse(io.stdout[0] ?? '{}').schema).toBe(`wholeloop/${schema}@1`)
  })
  it('contains unexpected filesystem failures', () => {
    const io = capture()
    expect(run(['docs', 'check', '--json'], io, '/nonexistent/wholeloop')).toBe(1)
    expect(JSON.parse(io.stdout[0] ?? '{}').code).toBe(1)
  })
})
