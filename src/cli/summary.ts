// Short summaries for people of the commands a new user runs first. Scripts and skills read the
// versioned payload through --json, which these summaries never replace.
import type { DoctorCheck } from '../diagnostics/doctor.js'

// Single quotes keep a store path with spaces copyable; a quote inside one is closed, escaped
// and reopened, the one portable way in POSIX shells.
const shellWord = (word: string) =>
  /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`
const shellLine = (words: readonly string[]) => words.map(shellWord).join(' ')
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function doctorSummary(report: { status: string; checks: readonly DoctorCheck[] }): string {
  const failed = report.checks.filter((check) => check.status === 'fail')
  const width = Math.max(...report.checks.map((check) => check.id.length))
  const lines = report.checks.flatMap((check) => [
    `  ${check.status.padEnd(7)}  ${check.id.padEnd(width)}${check.version ? `  ${check.version}` : ''}`.trimEnd(),
    // A passing check only needs its name; the others say what was seen and what to do.
    ...(check.status === 'pass' ? [] : [`           ${check.summary}`]),
    ...(check.repair
      ? [
          `           ${check.repair.instruction}`,
          `           Command: ${shellLine(check.repair.command)}`,
        ]
      : []),
  ])
  return [
    failed.length
      ? `Doctor: ${plural(failed.length, 'required check')} failed.`
      : 'Doctor: every required check passed.',
    '',
    ...lines,
    '',
    'Doctor cannot see whether the client loads the skills, is signed in or grants permissions.',
    'Add --json for the full report.',
  ].join('\n')
}

interface StatusItem {
  id: string
  kind: string
  title: string
  owner?: string
  status: string
  updatedAt: string
  flow: { next: string | null; available: boolean; pending: readonly { id: string }[] }
}

export function statusSummary(payload: {
  items: readonly StatusItem[]
  unreadCount: number
}): string {
  if (!payload.items.length)
    return "No stored work yet. Ask your coding client for wl-frame-problem, or run 'wl next <idea>'."
  const items = payload.items.flatMap((item) => [
    `${item.id}  ${item.kind}  ${item.status}  ${item.title}`,
    `  ${[item.owner ? `owner ${item.owner}` : undefined, `updated ${item.updatedAt.slice(0, 10)}`]
      .filter(Boolean)
      .join(' · ')}`,
    `  next: ${
      item.flow.next
        ? `${item.flow.next}${item.flow.available ? '' : ' (not available from the core yet)'}`
        : 'none'
    }${item.flow.pending.length ? ` · waiting on ${plural(item.flow.pending.length, 'decision')}` : ''}`,
  ])
  return [
    ...items,
    '',
    `${plural(payload.unreadCount, 'unread message')}. Add --json for the full status.`,
  ].join('\n')
}

interface InstallationSummary {
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
  return [
    headline[result.status] ?? `${action}: ${result.status} for ${subject}.`,
    ...planned,
    ...(result.backup ? [`Backups: ${result.backup}`] : []),
    `Receipt: ${result.receipt}`,
    ...next,
    'Add --json for the full result.',
  ].join('\n')
}
