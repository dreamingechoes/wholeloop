// Worktree allocation events and records, including port reservations.
import { isAbsolute } from 'node:path'
import { validate } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import schema from './schemas/allocation-v1.json' with { type: 'json' }

export interface WorktreeAllocation {
  repository: string
  commonDir: string
  repoKey: string
  mode: 'worktree' | 'checkout'
  path: string
  branch: string
  base: { ref: string; sha: string }
  target: { ref: string; sha: string }
  original: { ref?: string; sha: string }
  ports: { start: number; end: number }
}
export type WorktreeEventData =
  | { type: 'worktree.planned'; data: { allocation: WorktreeAllocation } }
  | { type: 'worktree.ready' | 'worktree.stopped'; data: Record<string, never> }
  | { type: 'worktree.failed' | 'worktree.abandoned'; data: { reason: string } }
  | { type: 'worktree.pruned'; data: { reason: 'merged' | 'abandoned' } }
export interface WorktreeRecord extends WorktreeAllocation {
  subject: string
  status: 'creating' | 'active' | 'stopped' | 'failed' | 'pruned'
  abandoned?: string
  failure?: string
}

export function validWorktreeData(type: string, data: Record<string, unknown>): boolean {
  if (type === 'worktree.planned') {
    if (
      Object.keys(data).some((key) => key !== 'allocation') ||
      validate(data.allocation, schema, 'allocation').length
    )
      return false
    const value = data.allocation as WorktreeAllocation
    return (
      [value.repository, value.commonDir, value.path].every(isAbsolute) &&
      value.ports.start <= value.ports.end
    )
  }
  if (['worktree.ready', 'worktree.stopped'].includes(type)) return !Object.keys(data).length
  if (['worktree.failed', 'worktree.abandoned', 'worktree.pruned'].includes(type))
    return (
      Object.keys(data).every((key) => key === 'reason') &&
      typeof data.reason === 'string' &&
      !!data.reason.trim() &&
      (type !== 'worktree.pruned' || ['merged', 'abandoned'].includes(data.reason))
    )
  return false
}

export function worktreeRecords(events: readonly StateEvent[]): WorktreeRecord[] {
  const records = new Map<string, WorktreeRecord>()
  for (const entry of events) {
    if (entry.type === 'worktree.planned') {
      if (records.has(entry.subject))
        throw new Error('Worktree allocation already exists for this subject')
      if (entry.data.allocation.branch !== `wl/${entry.subject}`)
        throw new Error('Worktree branch must match its subject')
      records.set(entry.subject, {
        ...structuredClone(entry.data.allocation),
        subject: entry.subject,
        status: 'creating',
      })
    } else if (entry.type.startsWith('worktree.')) {
      const record = records.get(entry.subject)
      if (!record) throw new Error('Worktree lifecycle event requires a prior allocation')
      if (record.status === 'pruned')
        throw new Error('A pruned allocation cannot restart implicitly')
      if (entry.type === 'worktree.ready') {
        if (record.abandoned) throw new Error('Abandoned work cannot restart implicitly')
        record.status = 'active'
        delete record.failure
      }
      if (entry.type === 'worktree.stopped') record.status = 'stopped'
      if (entry.type === 'worktree.failed') {
        record.status = 'failed'
        record.failure = entry.data.reason
      }
      if (entry.type === 'worktree.abandoned') {
        record.status = 'stopped'
        record.abandoned = entry.data.reason
      }
      if (entry.type === 'worktree.pruned') record.status = 'pruned'
    }
  }
  return [...records.values()].sort((a, b) => a.subject.localeCompare(b.subject))
}

export function allocatePorts(records: readonly WorktreeRecord[]): { start: number; end: number } {
  for (let start = 5200; start <= 6190; start += 10)
    if (
      !records.some(
        (record) =>
          record.status !== 'pruned' &&
          record.ports.start <= start + 9 &&
          record.ports.end >= start,
      )
    )
      return { start, end: start + 9 }
  throw new Error(
    'Worktree port reservations exhausted; prune eligible work before allocating more',
  )
}
