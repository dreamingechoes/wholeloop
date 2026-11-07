// Snapshots a workspace by hashing bytes and index entries, never copying files into state.
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readSourceBytes } from '../delivery/input.js'
import {
  assertObservationWritable,
  inReadObservation,
  observedRead,
} from '../state/read-observation.js'
import { currentHead, git, gitEnvironmentIdentity } from '../worktrees/git.js'

export interface WorkspaceSnapshot {
  digest: string
  head: string
  branch: string
}
interface SnapshotBounds {
  maxFileBytes: number
  maxBytes: number
  maxFiles: number
  denySymlinks: boolean
}
const validLimit = (value: number) => Number.isSafeInteger(value) && value >= 0

/** Hash bytes and index entries, never copy project files (or credentials) into state. */
export function workspaceSnapshot(root: string, bounds?: SnapshotBounds): WorkspaceSnapshot {
  if (!inReadObservation()) return readWorkspaceSnapshot(root, bounds)
  // Only fixed observers share a capture, then rehash before releasing their verdict.
  // Own policy limits and bind the Git environment so later calls cannot borrow a weaker proof.
  const limits = bounds
    ? {
        maxFileBytes: bounds.maxFileBytes,
        maxBytes: bounds.maxBytes,
        maxFiles: bounds.maxFiles,
        denySymlinks: bounds.denySymlinks,
      }
    : undefined
  // Malformed bounds keep their original physical refusal path; JSON keys must not
  // collapse NaN/Infinity/undefined into an otherwise shareable policy input.
  if (
    limits &&
    (!validLimit(limits.maxFileBytes) ||
      !validLimit(limits.maxBytes) ||
      !validLimit(limits.maxFiles) ||
      typeof limits.denySymlinks !== 'boolean')
  )
    return readWorkspaceSnapshot(root, bounds)
  const path = resolve(root),
    environment = gitEnvironmentIdentity(),
    key = JSON.stringify(['workspace-snapshot', path, limits ?? null, environment])
  return {
    ...observedRead(
      key,
      () => {
        if (gitEnvironmentIdentity() !== environment) assertObservationWritable()
        const value = readWorkspaceSnapshot(path, limits)
        return { bytes: Buffer.from(JSON.stringify(value)), value }
      },
      `workspace:${path}`,
    ),
  }
}

/** Every tracked/untracked path, mode, link target and byte still feeds the same digest. */
function readWorkspaceSnapshot(root: string, bounds?: SnapshotBounds): WorkspaceSnapshot {
  const { head, branch } = currentHead(root)
  const hash = createHash('sha256')
  const add = (value: string | Uint8Array) => {
    hash.update(String(value.length)).update(':').update(value).update('\0')
  }
  add(head)
  add(branch)
  add(git(root, ['ls-files', '--stage', '-z']))
  const paths = [
    ...new Set(
      git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
        .split('\0')
        .filter(Boolean),
    ),
  ].sort()
  if (bounds && paths.length > bounds.maxFiles)
    throw new Error('Workspace snapshot exceeds its file limit')
  let bytes = 0
  for (const path of paths) {
    add(path)
    try {
      const file = join(root, path)
      const stat = lstatSync(file)
      add(String(stat.mode))
      if (stat.isSymbolicLink()) {
        if (bounds?.denySymlinks) throw new Error('Workspace snapshot refuses symbolic links')
        add(readlinkSync(file))
      } else if (stat.isFile()) {
        const content = bounds
          ? readSourceBytes(root, path, bounds.maxFileBytes)
          : readFileSync(file)
        bytes += content.length
        if (bounds && bytes > bounds.maxBytes)
          throw new Error('Workspace snapshot exceeds its byte limit')
        add(content)
      } else throw new Error('Gate snapshots need regular files; inspect submodules explicitly')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      add('missing')
    }
  }
  return { digest: hash.digest('hex'), head, branch }
}

export function changedPaths(root: string, base: string): string[] {
  return [
    ...new Set(
      [
        // Git may otherwise refresh stat-only index entries when a file is restored.
        ...git(root, [
          '-c',
          'diff.autoRefreshIndex=false',
          'diff',
          '--name-only',
          '-z',
          base,
          '--',
        ]).split('\0'),
        ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
      ].filter(Boolean),
    ),
  ].sort()
}
