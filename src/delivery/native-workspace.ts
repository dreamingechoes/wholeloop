import { createHash } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { git, repository } from '../worktrees/git.js'
import { readSourceBytes } from './input.js'

/** Check raw control bytes before invoking Git again: a replaced gitdir/config can execute helpers. */
export function sealNativeGitControl(workspace: string): () => boolean {
  const root = realpathSync(workspace)
  const common = repository(root).commonDir
  const gitdir = realpathSync(git(root, ['rev-parse', '--absolute-git-dir']).trim())
  const directories = [...new Set([root, common, gitdir])]
  const entries = [
    { root, ref: '.git', directory: lstatSync(join(root, '.git')).isDirectory() },
    { root: common, ref: 'config', directory: false },
    { root: gitdir, ref: 'config.worktree', directory: false },
    { root: gitdir, ref: 'HEAD', directory: false },
    { root: gitdir, ref: 'index', directory: false },
  ]
  const observe = () => {
    for (const path of directories)
      if (realpathSync(path) !== path || lstatSync(path).isSymbolicLink())
        throw new Error('Changed Git control root')
    return contractDigest(
      entries.map((entry) => {
        try {
          const stat = lstatSync(join(entry.root, entry.ref))
          if (stat.isSymbolicLink() || (entry.directory ? !stat.isDirectory() : !stat.isFile()))
            throw new Error('Changed Git control type')
          return {
            ...entry,
            digest: entry.directory
              ? 'directory'
              : createHash('sha256')
                  .update(readSourceBytes(entry.root, entry.ref, 8 * 1024 * 1024))
                  .digest('hex'),
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return { ...entry, digest: 'absent' }
          throw error
        }
      }),
    )
  }
  const digest = observe()
  return () => {
    try {
      return observe() === digest
    } catch {
      return false
    }
  }
}
