import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { codehostRepository } from '../pull-requests/codehost.js'
import { ancestor, namedBase } from '../worktrees/git.js'
import {
  INTEGRATION_REQUEST_SCHEMA,
  IntegrationError,
  type IntegrationPart,
  integrationScope,
} from './contracts.js'
import { observeCommittedWorktree } from './observe.js'

/** Assembly consumes the complete approved predecessor closure, never a caller-selected subset. */
export function observeRequiredParts(
  plan: DeliveryPlan,
  milestone: string,
  parts: IntegrationPart[],
) {
  acceptanceShape(parts, INTEGRATION_REQUEST_SCHEMA.properties.parts)
  const scope = integrationScope(plan, milestone)
  if (
    new Set(parts.map((p) => p.work)).size !== parts.length ||
    new Set(parts.map((p) => p.path)).size !== parts.length ||
    contractDigest(parts.map((p) => p.work).sort()) !==
      contractDigest(scope.units.map((u) => u.id).sort())
  )
    throw new IntegrationError('required-part-coverage')
  for (const id of scope.repositories) {
    const repo = plan.repositories.find((r) => r.id === id)
    if (!repo || namedBase(repo.root, repo.target).sha !== repo.base)
      throw new IntegrationError('target-base-advanced')
    if (repo.remote && codehostRepository(repo.root, repo.remote.name).url !== repo.remote.url)
      throw new IntegrationError('repository-remote-changed')
  }
  const observed = scope.units.map((unit) => {
    const part = parts.find((p) => p.work === unit.id)
    if (!part || part.repository !== unit.repository) throw new IntegrationError('part-repository')
    return observeCommittedWorktree(plan, part)
  })
  for (const unit of scope.units) {
    const part = observed.find((p) => p.work === unit.id)
    if (!part) throw new IntegrationError('missing-predecessor')
    const root = plan.repositories.find((r) => r.id === part.repository)?.root
    if (!root) throw new IntegrationError('unknown-repository')
    for (const id of unit.after) {
      const dependency = observed.find((p) => p.work === id)
      if (
        !dependency ||
        (dependency.repository === part.repository && !ancestor(root, dependency.head, part.head))
      )
        throw new IntegrationError('uncommitted-predecessor-basis')
    }
  }
  return { scope, parts: observed }
}
