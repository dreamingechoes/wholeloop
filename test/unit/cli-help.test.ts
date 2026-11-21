import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../../src/cli/commands.js'
import { AREAS, suggestCommands } from '../../src/cli/help.js'
import { EXIT, type Io, run } from '../../src/cli/main.js'

function capture(): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return { stdout, stderr, out: (t) => stdout.push(t), err: (t) => stderr.push(t) }
}

function help(...argv: string[]) {
  const io = capture()
  const code = run(argv, io)
  return { code, out: io.stdout.join('\n'), err: io.stderr.join('\n') }
}

describe('default help', () => {
  it('fits on one screen and lists the everyday commands first', () => {
    const { code, out } = help('--help')
    expect(code).toBe(EXIT.ok)
    expect(out.split('\n').length).toBeLessThanOrEqual(50)
    const everyday = out.slice(0, out.indexOf('More commands'))
    for (const path of ['install', 'doctor', 'setup', 'status', 'next', 'resume'])
      expect(everyday).toMatch(new RegExp(`^  ${path}\\b`, 'm'))
    expect(everyday).not.toContain('delivery ')
  })

  it('reaches every command through an area or an everyday command of its group', () => {
    const { out } = help()
    const listed = new Set(AREAS.flatMap((area) => area.groups))
    expect(AREAS.flatMap((area) => area.groups)).toHaveLength(listed.size)
    for (const command of COMMANDS) {
      const group = command.path.split(' ')[0] ?? ''
      expect(
        // A group without an area is reached through an everyday command, whose own help lists
        // the commands that share its group.
        listed.has(group) || new RegExp(`^  ${group}\\b`, 'm').test(out),
        `${command.path} is not reachable from the default help`,
      ).toBe(true)
    }
  })

  it('prints every command with --all and keeps the JSON help complete', () => {
    const all = help('--help', '--all').out
    for (const command of COMMANDS) expect(all).toContain(`  ${command.path}`)
    for (const argv of [['--help'], ['install', '--help'], ['delivery', '--help']]) {
      const json = JSON.parse(help(...argv, '--json').out)
      expect(json.schema).toBe('wholeloop/help@1')
      expect(json.commands).toEqual(COMMANDS)
    }
  })

  it('hides repository tools from everyday help and bounds every human help line', () => {
    const everyday = help('--help').out
    expect(everyday).not.toContain('Repository tools:')
    expect(everyday).not.toContain('guard docs harness adapter release conformance display')
    const all = help('--help', '--all').out
    expect(all).toContain('  harness check')
    expect(everyday).toMatchSnapshot()
    for (const output of [
      everyday,
      all,
      help('install', '--help').out,
      help('release', '--help').out,
    ])
      for (const line of output.split('\n')) expect(line.length).toBeLessThanOrEqual(80)
  })
})

describe('command and group help', () => {
  it.each([
    { argv: ['install', '--help'], usage: 'Usage: wl install [options]', option: '--scope' },
    {
      argv: ['delivery', 'runner-status', '-h'],
      usage: 'Usage: wl delivery runner-status',
      option: '--json',
    },
    { argv: ['status', 'init-1', '--help'], usage: 'Usage: wl status [<id>]', option: '--json' },
  ])('prints the usage and options of $argv', ({ argv, usage, option }) => {
    const { code, out } = help(...argv)
    expect(code).toBe(EXIT.ok)
    expect(out.startsWith(usage)).toBe(true)
    expect(out).toMatch(new RegExp(`^  ${option}`, 'm'))
    expect(out).not.toContain('More commands')
  })

  it('lists related commands for a command that shares its group', () => {
    expect(help('overview', '--help').out).toContain('Related commands:\n  overview schema')
  })

  it('lists every command of a group', () => {
    const { code, out } = help('release', '--help')
    expect(code).toBe(EXIT.ok)
    for (const command of COMMANDS.filter((command) => command.path.startsWith('release ')))
      expect(out).toContain(`  ${command.path}`)
  })

  it('reports an unknown command with --help as unknown', () => {
    const { code, out, err } = help('instal', '--help')
    expect(code).toBe(EXIT.unexpected)
    expect(out).toBe('')
    expect(err).toBe(
      "wl: unknown command or option 'instal'. Did you mean 'wl install'? Run 'wl --help'.",
    )
  })
})

describe('suggestions for a mistyped command', () => {
  it.each([
    { args: ['instal'], expected: ['install'] },
    { args: ['stauts'], expected: ['status'] },
    { args: ['doctr', '--target', 'claude'], expected: ['doctor'] },
    { args: ['delivry', 'runner-status'], expected: ['delivery runner-status'] },
    { args: ['delivery', 'runner-sttus'], expected: ['delivery runner-status'] },
    { args: ['profile', 'shwo'], expected: ['profile show'] },
    { args: ['frobnicate'], expected: [] },
    { args: ['xy'], expected: [] },
    { args: ['--frobnicate'], expected: [] },
    { args: ['delivery'], expected: [] },
  ])('suggests $expected for $args', ({ args, expected }) => {
    expect(suggestCommands(args)).toEqual(expected)
  })

  it('names the suggestion in the error and keeps the exit code', () => {
    const io = capture()
    expect(run(['instal'], io)).toBe(EXIT.unexpected)
    expect(io.stderr).toEqual([
      "wl: unknown command or option 'instal'. Did you mean 'wl install'? Run 'wl --help'.",
    ])
  })

  it('points a bare group to its help', () => {
    const io = capture()
    expect(run(['delivery'], io)).toBe(EXIT.unexpected)
    expect(io.stderr).toEqual(["wl: 'delivery' needs a subcommand. Run 'wl delivery --help'."])
  })
})
