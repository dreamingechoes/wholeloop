// Keeps a large status readable without turning recorded facts into permission or live evidence.
import type { StatusItem } from '../status/project.js'
import { clipText, renderDisplay } from './render.js'

export interface StatusTerminal {
  columns?: number
  isTTY?: boolean
  noColor?: boolean
  forceColor?: string
}
type Row = Pick<StatusItem, 'id' | 'kind' | 'title' | 'status' | 'updatedAt'> &
  Partial<Omit<StatusItem, 'flow'>> & {
    flow: {
      next: string | null
      available: boolean
      pending: readonly { id: string; state?: string }[]
    }
  }
const labels: Record<string, string> = {
  research: 'research',
  'frame-problem': 'frame',
  'write-spec': 'specify',
  'cut-scopes': 'scope',
  'slice-work': 'plan slices',
  'build-slice': 'build',
  'verify-works': 'verify',
  'review-code': 'review',
  'open-pr': 'prepare PR',
  'prepare-launch': 'prepare launch',
  'ramp-exposure': 'ramp',
  'measure-impact': 'measure',
  'decide-next': 'decide',
}
const groupNames = ['Waiting on you', 'Due', 'In progress', 'Closed']
function rank(item: Row) {
  if (item.status === 'closed') return 3
  if (item.flow.pending.some((decision) => decision.state === 'actionable')) return 0
  return item.dueCheckpoints?.length ? 1 : 2
}

export function statusSummary(
  payload: { items: readonly Row[]; unreadCount: number },
  options: StatusTerminal & { all?: boolean } = {},
): string {
  const width = Number.isFinite(options.columns)
      ? Math.max(1, Math.floor(options.columns ?? 80))
      : 80,
    color = options.isTTY === true && !options.noColor && options.forceColor !== '0',
    line = (text: string) => clipText(text, width),
    children = new Map<string, Row[]>(),
    ids = new Set(payload.items.map(({ id }) => id))
  if (!payload.items.length)
    return line(
      "No stored work yet. Ask your coding client for wl-frame-problem, or run 'wl next <idea>'.",
    )
  for (const item of payload.items)
    if (item.parent && ids.has(item.parent)) {
      const siblings = children.get(item.parent) ?? []
      siblings.push(item)
      children.set(item.parent, siblings)
    }
  const facts = new Map<string, { rank: number; updatedAt: string; visible: boolean }>(),
    visiting = new Set<string>()
  function subtree(item: Row): { rank: number; updatedAt: string; visible: boolean } {
    if (visiting.has(item.id)) throw new Error('Item parent cycle')
    const cached = facts.get(item.id)
    if (cached) return cached
    visiting.add(item.id)
    const descendants = (children.get(item.id) ?? []).map(subtree),
      visible =
        options.all || item.status !== 'closed' || descendants.some((child) => child.visible),
      value = {
        rank: Math.min(
          rank(item),
          ...descendants.filter((child) => child.visible).map((child) => child.rank),
        ),
        updatedAt:
          [
            item.updatedAt,
            ...descendants.filter((child) => child.visible).map((child) => child.updatedAt),
          ]
            .sort()
            .at(-1) ?? item.updatedAt,
        visible: !!visible,
      }
    visiting.delete(item.id)
    facts.set(item.id, value)
    return value
  }
  for (const item of payload.items) subtree(item)
  const order = (a: Row, b: Row) =>
      subtree(a).rank - subtree(b).rank ||
      subtree(b).updatedAt.localeCompare(subtree(a).updatedAt) ||
      a.id.localeCompare(b.id),
    roots = payload.items.filter((item) => !item.parent || !ids.has(item.parent)).sort(order),
    lines: string[] = []
  const row = (item: Row, depth: number) => {
    if (!subtree(item).visible) return
    const step = item.focus?.step ?? item.activeStep ?? item.flow.next,
      waiting = item.flow.pending.filter(({ state }) => state === 'actionable').length,
      upcoming = item.flow.pending.filter(({ state }) => state === 'upcoming').length,
      detail = [
        item.status === 'closed' ? 'closed' : step ? (labels[step] ?? step) : 'no next step',
        ...(waiting ? [`${waiting} decision${waiting === 1 ? '' : 's'}`] : []),
        ...(upcoming ? [`${upcoming} upcoming`] : []),
        ...(item.gate
          ? [
              `${item.gate.gate} ${item.gate.round}/${item.gate.budget} ${item.gate.verdict}${item.gate.recorded ? ' recorded' : ''}, ${item.gate.openFindings} open`,
            ]
          : []),
        ...(item.dueCheckpoints?.length ? [`due ${item.dueCheckpoints.join(', ')}`] : []),
        ...(item.workspaces?.length
          ? [item.workspaces.map((workspace) => `${workspace.mode} ${workspace.status}`).join(', ')]
          : []),
        ...(item.children?.total
          ? [`${item.children.open}/${item.children.total} children open`]
          : []),
        ...(item.focus && item.focus.subject !== item.id ? [`via ${item.focus.subject}`] : []),
      ].join(' · ')
    // Reserve title space before optional detail so a busy item remains recognizable.
    const text = line(
      `${'  '.repeat(Math.min(depth, 8))}${depth ? '└ ' : ''}${item.id} ${clipText(item.title, Math.max(1, Math.min(24, Math.floor(width / 3))))} · ${detail}`,
    )
    lines.push(color && rank(item) === 0 ? `\u001b[33m${text}\u001b[0m` : text)
    for (const child of [...(children.get(item.id) ?? [])].sort(order)) row(child, depth + 1)
  }
  for (let group = 0; group < groupNames.length; group++) {
    const entries = roots.filter((item) => subtree(item).visible && subtree(item).rank === group)
    if (!entries.length) continue
    if (lines.length) lines.push('')
    const heading = line(groupNames[group] ?? '')
    lines.push(color ? `\u001b[1m${heading}\u001b[0m` : heading)
    for (const item of entries) row(item, 0)
  }
  if (!lines.length) lines.push(line('No open work. Add --all to include closed items.'))
  lines.push(
    '',
    line(
      `${payload.unreadCount} unread message${payload.unreadCount === 1 ? '' : 's'}. Add --json for the full status.`,
    ),
  )
  return lines.join('\n')
}

/** Native clients forward the identical plain tree; terminal width and colour are CLI-only. */
export function statusDisplay(
  payload: { items: readonly Row[]; unreadCount: number },
  options: { all?: boolean } = {},
) {
  return {
    ...renderDisplay({ header: 'Status', rows: [], produced: [], open: [], next: [] }),
    text: statusSummary(payload, options),
  }
}
