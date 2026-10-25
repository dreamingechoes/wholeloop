import { createHash } from 'node:crypto'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceBytes, rejectSourceCredentials } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { ENVIRONMENT_SNAPSHOT_LIMITS } from '../environment/candidates.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { codehostRepository } from '../pull-requests/codehost.js'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath } from '../state/paths.js'
import { ancestor, git, namedBase, registeredWorktrees, repository } from '../worktrees/git.js'
import {
  type IntegrationAssembly,
  IntegrationError,
  type IntegrationPart,
  integrationRequest,
} from './contracts.js'

export function observeCommittedWorktree<T extends IntegrationPart | IntegrationAssembly>(
  plan: DeliveryPlan,
  item: T,
) {
  const declared = plan.repositories.find((repo) => repo.id === item.repository)
  if (!declared) throw new IntegrationError('unknown-repository')
  if (
    canonicalPath(item.path) !== item.path ||
    item.path === declared.root ||
    item.ref === declared.target
  )
    throw new IntegrationError('personal-or-target-workspace')
  const root = repository(item.path),
    expected = repository(declared.root),
    registered = registeredWorktrees(declared.root).find((tree) => tree.path === item.path)
  if (
    root.path !== item.path ||
    root.commonDir !== expected.commonDir ||
    registered?.branch !== item.ref ||
    registered.locked
  )
    throw new IntegrationError('workspace-repository-binding')
  const before = workspaceSnapshot(item.path, ENVIRONMENT_SNAPSHOT_LIMITS)
  if (
    before.head !== item.head ||
    `refs/heads/${before.branch}` !== item.ref ||
    git(item.path, ['rev-parse', '--verify', '--end-of-options', `${item.ref}^{commit}`]).trim() !==
      item.head
  )
    throw new IntegrationError('changed-commit-vector')
  if (git(item.path, ['status', '--porcelain=v1', '--untracked-files=all']).trim())
    throw new IntegrationError('uncommitted-required-work')
  if (!ancestor(declared.root, declared.base, item.head))
    throw new IntegrationError('part-not-descended-from-base')
  if (workspaceSnapshot(item.path, ENVIRONMENT_SNAPSHOT_LIMITS).digest !== before.digest)
    throw new IntegrationError('workspace-changed-during-observation')
  return { ...item, snapshot: before.digest }
}
/** Read actual local commits and complete protected-store inputs. This never merges, switches, starts or publishes. */
export function observeIntegration(
  files: StoreFiles,
  value: unknown,
  plan: DeliveryPlan,
  digest: string,
) {
  const { input, scope } = integrationRequest(value, plan, digest)
  for (const id of scope.repositories) {
    const repo = plan.repositories.find((repo) => repo.id === id)
    if (!repo) throw new IntegrationError('unknown-repository')
    const current = namedBase(repo.root, repo.target)
    if (current.ref !== repo.target || current.sha !== repo.base)
      throw new IntegrationError('target-base-advanced')
    if (repo.remote && codehostRepository(repo.root, repo.remote.name).url !== repo.remote.url)
      throw new IntegrationError('repository-remote-changed')
  }
  const parts = input.parts.map((part) => observeCommittedWorktree(plan, part)),
    assemblies = input.assemblies.map((assembly) => {
      const repo = plan.repositories.find((repo) => repo.id === assembly.repository)
      if (!repo || assembly.base !== repo.base) throw new IntegrationError('assembly-base-binding')
      const observed = observeCommittedWorktree(plan, assembly)
      const parents = git(repo.root, ['rev-list', '--parents', '-n', '1', assembly.head])
        .trim()
        .split(/\s+/)
      if (
        parents.shift() !== assembly.head ||
        parents.some((parent) => !/^[a-f0-9]{40}$/.test(parent))
      )
        throw new IntegrationError('assembly-parent-observation')
      return { ...observed, parents }
    })
  for (const part of parts) {
    const unit = scope.units.find((unit) => unit.id === part.work)
    if (!unit) throw new IntegrationError('unknown-required-part')
    const root = plan.repositories.find((repo) => repo.id === part.repository)?.root
    if (!root) throw new IntegrationError('unknown-repository')
    for (const dependency of unit.after) {
      const before = parts.find((part) => part.work === dependency)
      if (!before) throw new IntegrationError('missing-predecessor')
      if (before.repository === part.repository && !ancestor(root, before.head, part.head))
        throw new IntegrationError('uncommitted-predecessor-basis')
    }
    const assembled = assemblies.find((item) => item.repository === part.repository)
    if (!assembled || !ancestor(root, part.head, assembled.head))
      throw new IntegrationError('required-part-not-assembled')
  }
  const recipes = new EnvironmentRecipes(files.root),
    acceptance = new DeliveryAcceptance(files.root),
    coveredRepositories = new Set<string>(),
    data = new Set<string>()
  const inputs = input.inputs.map((item) => {
    let bytes: Uint8Array
    if (item.kind === 'acceptance') {
      if (item.ref !== item.sha256) throw new IntegrationError('acceptance-reference-identity')
      const pinned = acceptance.get(item.ref)
      if (
        pinned.plan.run !== plan.run ||
        pinned.plan.revision !== plan.revision ||
        pinned.plan.plan !== digest ||
        pinned.plan.source !== plan.source ||
        scope.criteria.some(
          (id) =>
            !pinned.plan.cases.some(
              (test) => test.criteria.includes(id) && test.applicability === 'applicable',
            ),
        )
      )
        throw new IntegrationError('milestone-acceptance-coverage')
      bytes = Buffer.from(JSON.stringify(pinned))
    } else if (item.kind === 'recipe') {
      if (item.ref !== item.sha256) throw new IntegrationError('recipe-reference-identity')
      const selected = recipes.get(item.ref)
      for (const repo of selected.recipe.repositories) {
        const assembly = assemblies.find((item) => item.repository === repo.id)
        if (!assembly || repo.root !== assembly.path)
          throw new IntegrationError('recipe-not-bound-to-assembly')
        coveredRepositories.add(repo.id)
      }
      for (const id of selected.recipe.data) data.add(id)
      // Check the actual assembled selected bytes, rather than a metadata-only recipe claim.
      if (recipes.inspect(item.ref).inputs !== 'current')
        throw new IntegrationError('changed-recipe-inputs')
      bytes = Buffer.from(JSON.stringify(selected))
    } else {
      bytes = readSourceBytes(files.root, item.ref, 8 * 1024 * 1024)
      rejectSourceCredentials(Buffer.from(bytes).toString('utf8'))
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new IntegrationError('changed-input-bytes')
    }
    return { ...item, bytes: bytes.length }
  })
  if (
    scope.repositories.some((id) => !coveredRepositories.has(id)) ||
    [...data].some((id) => !inputs.some((input) => input.kind === 'data' && input.id === id))
  )
    throw new IntegrationError('recipe-or-data-coverage')
  return {
    schema: 'wholeloop/integration-candidate@1' as const,
    run: plan.run,
    revision: plan.revision,
    plan: digest,
    source: plan.source,
    milestone: input.milestone,
    strategy: input.strategy,
    parts,
    assemblies,
    contracts: scope.contracts,
    inputs,
    repairOwners: input.repairOwners,
    guidance: plan.guidance,
    dependencies: {
      milestones: scope.milestones,
      work: scope.units.map((unit) => ({
        id: unit.id,
        repository: unit.repository ?? '',
        role: unit.role,
        criteria: unit.criteria,
        after: unit.after,
        consumes: unit.consumes,
        produces: unit.produces,
      })),
      waves: scope.waves,
      criteria: scope.criteria,
      procedure: scope.procedure,
    },
    inputIdentity: contractDigest({
      source: plan.source,
      plan: digest,
      milestone: input.milestone,
      parts,
      assemblies,
      contracts: scope.contracts,
      inputs,
      guidance: plan.guidance,
      repairOwners: input.repairOwners,
    }),
    execution: 'not-performed' as const,
    acceptance: 'not-established' as const,
    publication: 'not-performed' as const,
  }
}
export type IntegrationCandidate = ReturnType<typeof observeIntegration>
