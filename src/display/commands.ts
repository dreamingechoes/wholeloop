// Presents existing command observations without another read or changing the machine contract.

import { isMap, parseDocument } from 'yaml'
import { isObject } from '../config/schema.js'
import { humanLines, renderDisplay } from './render.js'
import { stepDisplay } from './step.js'
import { PERSON_WORDS } from './terms.js'

const record = (input: unknown): Record<string, unknown> => (isObject(input) ? input : {})
const list = (input: unknown): unknown[] => (Array.isArray(input) ? input : [])
const text = (input: unknown): string =>
  typeof input === 'string' || typeof input === 'number'
    ? String(input)
    : typeof input === 'boolean'
      ? input
        ? 'yes'
        : 'no'
      : input === null
        ? 'not set'
        : ''
const label = (key: string) => {
  const name =
    PERSON_WORDS[key as keyof typeof PERSON_WORDS] ??
    key
      .replace(/Digest$/, ' revision')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
  return name.charAt(0).toUpperCase() + name.slice(1)
}
const privateFields = new Set([
  'schema',
  'style',
  'digest',
  'fingerprint',
  'configurationDigest',
  'cursor',
  'basis',
  'basisSnapshot',
  'envelope',
])

/** Technical inspection still has a text form; full schemas and private identities use --json. */
export function commandText(command: string, input: unknown): string {
  const payload = record(input)
  if (command === 'next' && isObject(payload.contract))
    return stepDisplay(`step begin`, payload.contract, [String(record(payload.action).step ?? '')])
      .text
  const rows: { label: string; value: string }[] = []
  const open: string[] = []
  const next: string[] = []
  const produced: string[] = []
  const row = (name: string, value: unknown) => {
    if (text(value)) rows.push({ label: name, value: text(value) })
  }
  const facts = (value: unknown, prefix = '', depth = 0): void => {
    if (depth > 6) {
      row(prefix || 'Details', 'Available with --json')
      return
    }
    if (Array.isArray(value)) {
      if (!value.length) row(prefix, 'None')
      for (const [index, entry] of value.entries())
        facts(entry, `${prefix}${value.length > 1 ? ` ${index + 1}` : ''}`, depth + 1)
    } else if (isObject(value)) {
      for (const [key, entry] of Object.entries(value))
        if (!privateFields.has(key))
          facts(entry, [prefix, label(key)].filter(Boolean).join(' / '), depth + 1)
    } else
      row(
        prefix,
        /(?:^|\/ )(?:From|To|Role)$/.test(prefix) && value === 'conductor' ? 'coordinator' : value,
      )
  }
  const questions = () => {
    for (const value of list(payload.questions)) {
      const question = record(value)
      open.push(text(question.prompt) || text(question.question))
      for (const option of list(question.options)) {
        const choice = record(option)
        open.push(
          `  ${text(choice.label) || text(choice.value)}${choice.value !== choice.label && choice.value !== undefined ? ` (${text(choice.value)})` : ''}`,
        )
      }
      if (question.freeText === true) open.push('  You can also enter your own answer.')
    }
  }
  let header = command.split(' ').map(label).join(' ')
  if (/(?: |-)schema$/.test(command) || /-schema@/.test(text(payload.schema))) {
    row('Format', 'Use --json for the complete machine-readable schema.')
  } else if (Array.isArray(payload.providers) || Array.isArray(payload.entries)) {
    row('Entries', list(payload.providers ?? payload.entries).length)
    for (const item of list(payload.providers ?? payload.entries)) {
      const entry = record(item),
        manifest = record(entry.manifest)
      row(
        text(manifest.name) || text(manifest.id),
        [text(manifest.description), list(manifest.capabilities).map(text).join(', ')]
          .filter(Boolean)
          .join(' · '),
      )
      if (manifest.id) row('Identifier', manifest.id)
      if (entry.origin) row('Source', entry.origin)
    }
    for (const item of list(payload.problems))
      open.push(
        [text(record(item).file), text(record(item).message) || text(item)]
          .filter(Boolean)
          .join(': '),
      )
    row('Connection checks', payload.probe)
  } else if (['build', 'adapter build-native', 'release artifacts'].includes(command)) {
    header = payload.dryRun === true ? 'Artifact preview' : 'Generated artifacts'
    for (const key of [
      'target',
      'directory',
      'root',
      'output',
      'status',
      'dryRun',
      'written',
      'unchanged',
    ])
      if (payload[key] !== undefined) row(label(key), payload[key])
    const manifest = record(payload.manifest)
    row('Target', manifest.target)
    if (payload.files)
      row(
        'Files',
        Array.isArray(payload.files)
          ? payload.files.length
          : Object.keys(record(payload.files)).length,
      )
    if (manifest.files) row('Packaged files', Object.keys(record(manifest.files)).length)
    if (payload.dryRun === true) row('Saved', 'No files written')
  } else if (command === 'setup') {
    header = 'Preferences'
    questions()
    if (!open.length) {
      row('Saved', payload.applied === true ? 'yes' : 'This run only; no file written')
      row('Scope', payload.scope)
      row('File', payload.file)
      facts(record(payload.override))
    }
  } else if (command === 'next') {
    header = 'Next step'
    questions()
    row('Item', payload.subject)
    if (payload.stop) open.push(text(payload.stop))
    if (record(payload.action).command) next.push(text(record(payload.action).command))
    if (!open.length && !next.length) row('Status', 'No next step recorded')
    if (payload.blockedBy) facts(payload.blockedBy, 'Dependencies')
    if (payload.blocked) facts(payload.blocked, 'Blocked work')
  } else if (command === 'resume') {
    const subject = record(payload.subject),
      flow = record(payload.flow)
    header = `Resume · ${text(subject.title)}`
    row('Item', subject.id)
    row('Owner', subject.owner)
    row('Status', subject.status)
    row('Related work', payload.totalItems)
    row('Unread messages', payload.unreadCount === null ? 'unknown' : payload.unreadCount)
    for (const item of list(payload.items)) row(text(record(item).title), record(item).status)
    for (const pending of list(flow.pending)) open.push(`Decision: ${text(record(pending).id)}`)
    for (const note of list(payload.notes)) row('Note', note)
    for (const artifact of list(payload.artifacts)) produced.push(text(record(artifact).path))
    if (payload.truncated === true)
      open.push('This view is shortened; open the item for its full history.')
    if (payload.next) next.push(text(payload.next))
  } else if (['profile show', 'profile preset', 'profile set'].includes(command)) {
    header = command === 'profile show' ? 'Interaction preferences' : 'Preferences updated'
    facts(payload.profile)
    if (payload.sources) facts(payload.sources, 'Source')
    if (payload.override) row('Saved', 'This run only; no file written')
  } else if (command === 'config show') {
    header = 'Configuration'
    facts(payload.values)
    if (payload.sources) facts(payload.sources, 'Source')
  } else if (command === 'overview') {
    header = 'Work overview'
    row('Health', record(payload.health).status)
    row('Attention', payload.headline)
    row('Unread messages', payload.unreadCount === null ? 'unknown' : payload.unreadCount)
    for (const [key, name] of [
      ['items', 'Items'],
      ['deliveries', 'Delivery runs'],
      ['agents', 'Activity records'],
      ['worktrees', 'Workspaces'],
      ['scheduled', 'Scheduled checks'],
    ] as const) {
      if (record(payload.counts)[key] !== undefined) row(name, record(payload.counts)[key])
    }
    if (payload.counts === null) open.push('The store is unavailable; totals are unknown.')
    for (const problem of list(record(payload.health).problems)) open.push(text(problem))
    for (const item of list(payload.items)) {
      const entry = record(item)
      row(text(entry.title) || text(entry.id), entry.status ?? record(entry.flow).next)
    }
    for (const attention of list(payload.attention)) {
      const entry = record(attention)
      row('Needs attention', `${text(record(entry.target).id)}: ${label(text(entry.reason))}`)
      for (const action of list(entry.next)) {
        const argv = list(record(action).argv).map((argument) =>
          typeof argument === 'string'
            ? argument
            : typeof record(argument).input === 'string'
              ? `${text(record(argument).prefix)}<${text(record(argument).input)}>`
              : undefined,
        )
        if (argv.length && argv.every((argument) => argument !== undefined))
          next.push(argv.join(' '))
        else open.push('The action arguments are unavailable; inspect this item before continuing.')
      }
    }
    if (
      Object.values(record(payload.omitted)).some((value) => typeof value === 'number' && value > 0)
    )
      open.push('This view is shortened; use --json for omitted counts and full details.')
  } else if (command === 'watch' && isObject(payload.overview)) {
    return commandText('overview', payload.overview)
  } else if (command.startsWith('worktree ')) {
    const workspace = record(payload.record ?? payload.workspace ?? payload)
    row('Workspace', workspace.path)
    row('Branch', workspace.branch)
    row('Status', workspace.status)
    facts(
      Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => !['path', 'branch', 'status', 'workspace', 'record'].includes(key),
        ),
      ),
    )
    if (payload.tested === false) row('Human testing', 'Not recorded by opening the workspace')
    if (payload.workspace && !rows.length) facts(payload.workspace)
  } else if (isObject(payload.item)) {
    const item = payload.item
    header = `${label(command)} · ${text(item.title)}`
    row('Item', item.id)
    row('Owner', item.owner)
    row('Status', item.status)
    if (item.parent) row('Parent', item.parent)
    if (item.body) row('Content', item.body)
    if (item.notes) facts(item.notes, 'Notes')
    if (item.links) facts(item.links, 'Links')
  } else facts(payload)
  return renderDisplay({ header, rows, produced, open, next }).text
}

/** Raw projections remain opt-in; human reads show the document without metadata delimiters. */
export function openText(item: {
  id: string
  title: string
  owner: string
  status: string
  body: string
  notes?: readonly { text: string }[]
  links?: readonly string[]
}): string {
  const header = renderDisplay({
    header: `Open · ${item.title}`,
    rows: [
      { label: 'Item', value: item.id },
      { label: 'Owner', value: item.owner },
      { label: 'Status', value: item.status },
    ],
    produced: [],
    open: [],
    next: [],
  }).text
  const metadata = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(item.body)
  // A Markdown horizontal rule can begin ordinary prose; only a mapping is metadata.
  const document = metadata ? parseDocument(metadata[1] ?? '') : undefined
  const body = (
    metadata && document && !document.errors.length && isMap(document.contents)
      ? item.body.slice(metadata[0].length)
      : item.body
  ).trim()
  return [
    header,
    body ? humanLines(body) : 'No document content yet.',
    ...(item.notes?.length ? ['Notes', ...item.notes.map((note) => humanLines(note.text))] : []),
    ...(item.links?.length ? ['Links', ...item.links.map(humanLines)] : []),
  ].join('\n\n')
}
