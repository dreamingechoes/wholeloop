// Help text for people: a short default page, one page per command or group, and a suggestion for
// a mistyped command. The JSON help still lists every command from the table, unchanged.
import { VERSION } from '../version.js'
import { COMMANDS, type Command } from './commands.js'

// The commands a new user needs, in the order they need them. Everything else is reached through
// its group, so the default page stays one screen while the table keeps growing.
const EVERYDAY: readonly { title: string; paths: readonly string[] }[] = [
  { title: 'Get started', paths: ['install', 'doctor', 'setup', 'uninstall'] },
  { title: 'Your work', paths: ['status', 'next', 'resume', 'overview', 'watch'] },
  { title: 'Preferences', paths: ['profile show', 'profile preset', 'config show'] },
]

// Every first word of a command path belongs to exactly one area; a test fails when a new group
// is missing, so no command can become unreachable from the default page.
export const AREAS: readonly { title: string; groups: readonly string[] }[] = [
  { title: 'Define', groups: ['research', 'frame', 'spec', 'scopes', 'challenge'] },
  {
    title: 'Build',
    groups: ['slices', 'worktree', 'build', 'verify', 'review', 'gate', 'pr', 'fanout'],
  },
  { title: 'Rollout and learn', groups: ['launch', 'ramp', 'env', 'measure', 'learn'] },
  {
    title: 'Items and messages',
    groups: [
      'state',
      'step',
      'answer',
      'msg',
      'handoff',
      'note',
      'link',
      'open',
      'sync',
      'share',
      'adopt',
    ],
  },
  {
    title: 'Configuration',
    groups: ['config', 'profile', 'provider', 'template', 'lens', 'mcp', 'discover', 'resolve'],
  },
  { title: 'Autonomous delivery (experimental)', groups: ['delivery', 'maintenance', 'eval'] },
  {
    title: 'Repository tools',
    groups: ['guard', 'docs', 'harness', 'adapter', 'release', 'conformance'],
  },
]

const OPTIONS = `Options:
  -v, --version   Print the version
  -h, --help      Print help; after a command or group, print help for it
  --json          Print a versioned JSON payload`

const line = (command: Command, width = 30) =>
  `  ${`${command.path} ${command.arguments}`.trim().padEnd(width)} ${command.summary}`
const byPath = (path: string) => COMMANDS.find((command) => command.path === path)
const groupOf = (path: string) => path.split(' ')[0] ?? path

/** The default page: everyday commands, then every other group by area. */
export function usage(): string {
  const sections = EVERYDAY.map(
    ({ title, paths }) =>
      `${title}:\n${paths
        .map(byPath)
        .filter((command) => command !== undefined)
        .map((command) => line(command))
        .join('\n')}`,
  )
  const areas = AREAS.map(({ title, groups }) => `  ${title}\n    ${groups.join(' ')}`).join('\n')
  return `wholeloop ${VERSION} — a CLI-agnostic AI development harness

Usage: wl <command> [options]

${sections.join('\n\n')}

More commands, by group:
${areas}

${OPTIONS}

Run 'wl <command> --help' for one command, 'wl <group> --help' for a group,
or 'wl --help --all' for every command.`
}

/** Every command, in table order: the page the default help replaced. */
export function fullUsage(): string {
  return `wholeloop ${VERSION} — a CLI-agnostic AI development harness

Usage: wl <command> [options]

${OPTIONS}

Commands:
${COMMANDS.map((command) => line(command)).join('\n')}`
}

/** One command's usage, summary and options, with the commands that share its group. */
export function commandUsage(command: Command): string {
  const related = COMMANDS.filter(
    (other) => other !== command && groupOf(other.path) === groupOf(command.path),
  )
  const options = [...command.options, '--json']
  return [
    `Usage: wl ${`${command.path} ${command.arguments}`.trim()}${command.options.length ? ' [options]' : ''}`,
    '',
    command.summary,
    '',
    `Options:\n${options.map((option) => `  ${option}`).join('\n')}`,
    ...(related.length
      ? ['', `Related commands:\n${related.map((other) => line(other)).join('\n')}`]
      : []),
  ].join('\n')
}

/** Every command whose path starts with the group's word, or undefined for an unknown group. */
export function groupUsage(group: string): string | undefined {
  const commands = COMMANDS.filter((command) => groupOf(command.path) === group)
  if (!commands.length) return undefined
  const width = Math.min(
    44,
    Math.max(...commands.map((command) => `${command.path} ${command.arguments}`.trim().length)),
  )
  return `Commands in '${group}':\n${commands.map((command) => line(command, width)).join('\n')}\n\nRun 'wl <command> --help' for one of them.`
}

/** Optimal string alignment distance: an edit, insertion, deletion or swap of neighbours. */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = rows[i] as number[]
      const above = rows[i - 1] as number[]
      row[j] = Math.min((above[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (above[j - 1] ?? 0) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j] ?? 0, ((rows[i - 2] as number[])[j - 2] ?? 0) + 1)
    }
  return (rows[a.length] as number[])[b.length] ?? 0
}

// Short words tolerate one edit and longer ones two: 'instal' finds 'install', while 'pr' and
// 'go' do not suggest each other's neighbours.
const closest = (word: string, candidates: readonly string[]) => {
  const limit = word.length < 5 ? 1 : 2
  const scored = [...new Set(candidates)]
    .map((candidate) => ({ candidate, score: distance(word, candidate) }))
    .filter(({ score }) => score <= limit)
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
  const best = scored[0]?.score
  return scored.filter(({ score }) => score === best).map(({ candidate }) => candidate)
}

/**
 * At most two known commands close to a mistyped command line, or none. A known group with a
 * mistyped subcommand is matched within that group; an option or an empty line suggests nothing.
 */
export function suggestCommands(args: readonly string[]): string[] {
  const words = args.filter((arg) => !arg.startsWith('-'))
  const [first, second] = words
  if (!first || args[0]?.startsWith('-')) return []
  const groups = COMMANDS.map((command) => groupOf(command.path))
  if (groups.includes(first)) {
    if (!second) return []
    const subcommands = COMMANDS.filter((command) => groupOf(command.path) === first).map(
      (command) => command.path.split(' ').slice(1).join(' '),
    )
    return closest(second, subcommands)
      .slice(0, 2)
      .map((subcommand) => `${first} ${subcommand}`)
  }
  return closest(first, groups)
    .slice(0, 2)
    .flatMap((group) => {
      const exact = byPath([group, ...words.slice(1)].join(' '))
      return exact ? [exact.path] : [group]
    })
}
