// Captures bounded copies of environment candidate files, never Git control, symlinks or credential
// files.
import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { join, posix } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryGrant } from '../delivery/authority.js'
import { readSourceBytes, rejectSourceCredentials } from '../delivery/input.js'
import { sealNativeGitControl } from '../delivery/native-workspace.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { canonicalPath } from '../state/paths.js'
import { git, repository } from '../worktrees/git.js'
import { DockerEnvironmentError } from './docker-command.js'
import { type EnvironmentRecipe, environmentRelativeFile } from './recipe.js'

export const ENVIRONMENT_SNAPSHOT_LIMITS = {
  maxFileBytes: 8 * 1024 * 1024,
  maxBytes: 32 * 1024 * 1024,
  maxFiles: 5000,
  denySymlinks: true,
}
export interface EnvironmentCandidate {
  repository: string
  path: string
  head: string
  snapshot: string
}
export interface EnvironmentCopy {
  path: string
  body: string
  executable: boolean
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Copy bounded regular candidate files, never Git control, symlinks, personal checkouts or native credential files. */
export function captureEnvironmentCandidates(
  recipe: EnvironmentRecipe,
  plan: DeliveryPlan,
  grant: DeliveryGrant,
  inputs: EnvironmentCandidate[],
) {
  if (
    inputs.length !== recipe.repositories.length ||
    new Set(inputs.map((input) => input.repository)).size !== inputs.length
  )
    throw new DockerEnvironmentError('candidate-coverage')
  let total = 0
  return inputs.map((input) => {
    const source = recipe.repositories.find((repo) => repo.id === input.repository)
    const target = plan.repositories.find((repo) => repo.id === input.repository)
    const scope = grant.repositories.find((repo) => repo.repository === input.repository)
    if (
      !source ||
      !target ||
      !scope ||
      canonicalPath(input.path) === canonicalPath(target.root) ||
      canonicalPath(input.path) !== input.path ||
      repository(input.path).commonDir !== repository(target.root).commonDir ||
      repository(source.root).commonDir !== repository(target.root).commonDir
    )
      throw new DockerEnvironmentError('unallocated-candidate')
    const sealed = sealNativeGitControl(input.path)
    const before = workspaceSnapshot(input.path, ENVIRONMENT_SNAPSHOT_LIMITS)
    if (
      before.head !== input.head ||
      before.digest !== input.snapshot ||
      !before.branch.startsWith(scope.topicPrefix)
    )
      throw new DockerEnvironmentError('changed-candidate')
    const selected = [
      ...new Set([
        ...git(input.path, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
          .split('\0')
          .filter(Boolean),
        ...recipe.files
          .filter((file) => file.repository === input.repository)
          .map((file) => file.ref),
      ]),
    ].sort()
    if (selected.length > 5000) throw new DockerEnvironmentError('candidate-file-limit')
    const files: EnvironmentCopy[] = []
    for (const path of selected) {
      if (
        !environmentRelativeFile(path) ||
        /^(?:\.env(?:\.|$)|\.npmrc$|\.pypirc$|auth\.json$|credentials(?:\.|$))/i.test(
          posix.basename(path),
        )
      )
        throw new DockerEnvironmentError('unsafe-candidate-file')
      let stat: ReturnType<typeof lstatSync>
      try {
        stat = lstatSync(join(input.path, path))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new DockerEnvironmentError('unsafe-candidate-file')
      const bytes = readSourceBytes(input.path, path, 8 * 1024 * 1024)
      rejectSourceCredentials(bytes.toString('utf8'))
      total += bytes.length
      if (total > 32 * 1024 * 1024) throw new DockerEnvironmentError('candidate-byte-limit')
      const pin = recipe.files.find(
        (file) => file.repository === input.repository && file.ref === path,
      )
      if (pin && hash(bytes) !== pin.sha256)
        throw new DockerEnvironmentError('changed-recipe-input')
      files.push({ path, body: bytes.toString('base64'), executable: !!(stat.mode & 0o111) })
    }
    if (
      !sealed() ||
      workspaceSnapshot(input.path, ENVIRONMENT_SNAPSHOT_LIMITS).digest !== before.digest
    )
      throw new DockerEnvironmentError('changed-candidate')
    return { candidate: { ...input, content: contractDigest(files) }, files }
  })
}
