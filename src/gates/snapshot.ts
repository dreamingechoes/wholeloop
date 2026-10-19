import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { git } from '../worktrees/git.js'

export interface WorkspaceSnapshot {
  digest: string
  head: string
  branch: string
}

/** Hash bytes and index entries, never copy project files (or credentials) into state. */
export function workspaceSnapshot(root: string): WorkspaceSnapshot {
  const head = git(root, ['rev-parse', 'HEAD']).trim()
  const branch = git(root, ['branch', '--show-current']).trim()
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
  for (const path of paths) {
    add(path)
    try {
      const file = join(root, path)
      const stat = lstatSync(file)
      add(String(stat.mode))
      if (stat.isSymbolicLink()) add(readlinkSync(file))
      else if (stat.isFile()) add(readFileSync(file))
      else throw new Error('Gate snapshots need regular files; inspect submodules explicitly')
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
