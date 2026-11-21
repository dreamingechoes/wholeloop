// Short summaries for people of the commands a new user runs first. Scripts and skills read the
// versioned payload through --json, which these summaries never replace.
import type { DoctorCheck } from '../diagnostics/doctor.js'
import { humanLines } from '../display/render.js'

// Single quotes keep a store path with spaces copyable; a quote inside one is closed, escaped
// and reopened, the one portable way in POSIX shells.
const shellWord = (word: string) =>
  /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`
const shellLine = (words: readonly string[]) => words.map(shellWord).join(' ')
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function doctorSummary(report: { status: string; checks: readonly DoctorCheck[] }): string {
  const failed = report.checks.filter((check) => check.status === 'fail')
  const optional = report.checks.filter(
    (check) => check.status !== 'fail' && (check.id.startsWith('cli.') || check.status !== 'pass'),
  )
  const lines = failed.flatMap((check) => [
    `  Failed: ${check.id}${check.version ? ` (${check.version})` : ''}`,
    `    ${check.summary}`,
    ...(check.repair
      ? [`    ${check.repair.instruction}`, `    Command: ${shellLine(check.repair.command)}`]
      : []),
  ])
  return humanLines(
    [
      failed.length
        ? `Doctor: ${plural(failed.length, 'check')} failed.`
        : 'Doctor: no failed checks.',
      `Observed: ${plural(report.checks.filter((check) => check.status === 'pass').length, 'passing check')}.`,
      ...(optional.length
        ? [
            `Optional checks: ${optional.filter((check) => check.status === 'pass').length} observed, ${optional.filter((check) => check.status === 'unknown').length} unknown, ${optional.filter((check) => check.status === 'skip').length} skipped.`,
          ]
        : []),
      ...(lines.length ? ['', ...lines] : []),
      '',
      'Doctor cannot see whether the client loads the skills, is signed in or grants permissions.',
      'Add --json for the full report.',
    ].join('\n'),
  )
}

export { statusSummary } from '../display/status.js'

interface InstallationSummary {
  storeAccess?: { file: string; snippet: string }
  schema: string
  status: string
  scope: string
  targets: readonly string[]
  receipt: string
  files?: readonly string[]
  remove?: readonly string[]
  backup?: string
  activation?: { command: readonly string[] }
  removal?: { command: readonly string[] }
}

export function installationSummary(result: InstallationSummary): string {
  const action = result.schema.includes('uninstall') ? 'uninstall' : 'install'
  const subject = `${result.targets.join(', ')} at ${result.scope} scope`
  const headline: Record<string, string> = {
    'already-correct': `Already installed: ${subject} matches this version.`,
    'already-absent': `Nothing to remove: ${subject} is not installed.`,
    planned: `Dry run for ${subject}: nothing was written.`,
    installed: `Installed ${subject}.`,
    uninstalled: `Removed ${subject}.`,
  }
  const planned =
    result.status === 'planned'
      ? [
          `  ${plural(result.files?.length ?? 0, 'file')} to ${action === 'install' ? 'write' : 'remove'}`,
          ...(action === 'install' && result.remove?.length
            ? [`  ${plural(result.remove.length, 'file')} to remove`]
            : []),
          `Run the same command without --dry-run to apply it.`,
        ]
      : []
  const next = result.activation
    ? [
        'Restart the client and check that the skills appear.',
        `Git guards are installed per repository: ${shellLine(result.activation.command)}`,
      ]
    : result.removal
      ? [
          'Restart the client to confirm the skills are gone.',
          `Git guards are removed per repository: ${shellLine(result.removal.command)}`,
        ]
      : []
  return humanLines(
    [
      headline[result.status] ?? `${action}: ${result.status} for ${subject}.`,
      ...planned,
      ...(result.backup ? [`Backups: ${result.backup}`] : []),
      ...(result.status === 'planned' ? [] : [`Installation record: ${result.receipt}`]),
      ...next,
      ...(result.storeAccess
        ? [
            `Codex store access — review only; no client settings were changed: ${result.storeAccess.file}`,
            result.storeAccess.snippet,
            'Merge this with your existing settings only after choosing to allow the store; keep other writable roots you still need.',
          ]
        : []),
      'Add --json for the full result.',
    ].join('\n'),
  )
}
