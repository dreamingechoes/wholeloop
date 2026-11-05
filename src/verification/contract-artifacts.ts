import { createHash } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceBytes } from '../delivery/input.js'
import { type DeliveryPlan, deliveryPlanSchema, validateDeliveryShape } from '../delivery/plan.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { canonicalPath } from '../state/paths.js'
import { ancestor, git, repository } from '../worktrees/git.js'

export class ContractArtifactError extends Error {
  constructor(readonly problem: string) {
    super(`Contract artifacts refused: ${problem}; contents omitted`)
  }
}

/** A checksum match establishes mechanical identity, never behavioral QA or approval. */
export function observeContractArtifacts(
  plan: Readonly<DeliveryPlan>,
  unit: string,
  workspace: string,
  refs: Readonly<Record<string, string>>,
) {
  validateDeliveryShape(plan, deliveryPlanSchema(plan))
  const work = plan.work.find((entry) => entry.id === unit)
  if (work?.role !== 'contract' || work.criteria.length || !work.produces.length)
    throw new ContractArtifactError('contract-only-unit-required')
  if (
    contractDigest(Object.keys(refs).sort()) !==
    contractDigest(work.produces.map((entry) => entry.id).sort())
  )
    throw new ContractArtifactError('exact-contract-selection-required')
  const declared = plan.repositories.find((entry) => entry.id === work.repository),
    actual = repository(workspace)
  if (
    !declared ||
    actual.path !== canonicalPath(workspace) ||
    actual.commonDir !== repository(declared.root).commonDir
  )
    throw new ContractArtifactError('contract-repository-binding')
  const clean = () => {
    if (git(workspace, ['status', '--porcelain=v1', '-z']).length)
      throw new ContractArtifactError('committed-clean-candidate-required')
  }
  clean()
  const before = workspaceSnapshot(workspace)
  if (!ancestor(workspace, declared.base, before.head))
    throw new ContractArtifactError('contract-base-ancestry')
  // Git's NUL-delimited index is authoritative for committed membership. A
  // matching untracked file or symlink must not stand in for the deliverable.
  const tracked = new Map(
    git(workspace, ['ls-files', '--stage', '-z'])
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const match = /^([0-7]{6}) ([a-f0-9]{40,64}) 0\t([\s\S]+)$/.exec(line)
        if (!match?.[1] || !match[3]) throw new ContractArtifactError('unmerged-contract-index')
        return [match[3], match[1]] as const
      }),
  )
  let total = 0
  const observed = new Map<string, { sha256: string; bytes: number }>()
  const contracts = work.produces
    .map((contract) => {
      const ref = refs[contract.id]
      if (!ref || !['100644', '100755'].includes(tracked.get(ref) ?? ''))
        throw new ContractArtifactError('tracked-regular-contract-required')
      let actual = observed.get(ref)
      if (!actual) {
        const bytes = readSourceBytes(workspace, ref, 256 * 1024)
        total += bytes.length
        if (total > 4 * 1024 * 1024) throw new ContractArtifactError('contract-byte-limit')
        actual = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
        observed.set(ref, actual)
      }
      if (actual.sha256 !== contract.sha256)
        throw new ContractArtifactError('contract-checksum-mismatch')
      return { ...contract, ref, bytes: actual.bytes }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  const after = workspaceSnapshot(workspace)
  clean()
  if (contractDigest(before) !== contractDigest(after))
    throw new ContractArtifactError('changed-contract-candidate')
  return {
    plan: contractDigest(plan),
    unit,
    repository: work.repository,
    snapshot: after,
    contracts,
    status: 'matched' as const,
    provenance: 'host-observed' as const,
    qa: 'not-established' as const,
    humanApproval: 'not-recorded' as const,
  }
}
