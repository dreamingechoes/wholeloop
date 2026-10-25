import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { planWaves } from '../delivery/plan.js'
import { checkDependencies } from '../slices/contract.js'
import schema from './schemas/request-v1.json' with { type: 'json' }

export const INTEGRATION_REQUEST_SCHEMA = schema
export interface IntegrationPart {
  work: string
  repository: string
  path: string
  ref: string
  head: string
}
export interface IntegrationAssembly {
  repository: string
  path: string
  ref: string
  base: string
  head: string
}
export interface IntegrationInput {
  id: string
  kind: 'acceptance' | 'recipe' | 'data' | 'gate-policy'
  ref: string
  sha256: string
  after: string[]
  repository?: string
  gate?: 'verify' | 'review'
}
export interface IntegrationRequest {
  schema: 'wholeloop/integration-candidate-request@1'
  run: string
  revision: number
  plan: string
  milestone: string
  strategy: 'ordered-merge'
  parts: IntegrationPart[]
  assemblies: IntegrationAssembly[]
  contracts: { id: string; revision: string; sha256: string }[]
  inputs: IntegrationInput[]
  repairOwners: { criterion: string; kind: 'work' | 'integration'; id: string }[]
}
export class IntegrationError extends Error {
  constructor(readonly problem: string) {
    super(`Integration refused: ${problem}; retain source worktrees and observations`)
  }
}
const same = (a: readonly string[], b: readonly string[]) =>
  contractDigest([...a].sort()) === contractDigest([...b].sort())
function unique(values: readonly string[], reason: string) {
  if (new Set(values).size !== values.length) throw new IntegrationError(reason)
}
/** The accepted plan already validates cycles/coverage. Recompute complete predecessor closure, never caller-selected subsets. */
export function integrationScope(plan: DeliveryPlan, milestone: string) {
  try {
    checkDependencies(new Map(plan.work.map((unit) => [unit.id, unit.after])))
    checkDependencies(new Map(plan.milestones.map((item) => [item.id, item.after])))
  } catch {
    throw new IntegrationError('integration-dependency-cycle')
  }

  const selected = plan.milestones.find((item) => item.id === milestone)
  if (!selected) throw new IntegrationError('unknown-milestone')
  const milestones = new Set<string>(),
    work = new Set<string>()
  const visitMilestone = (id: string) => {
    if (milestones.has(id)) return
    const item = plan.milestones.find((item) => item.id === id)
    if (!item) throw new IntegrationError('unknown-milestone')
    milestones.add(id)
    for (const dependency of item.after) visitMilestone(dependency)
    for (const id of item.work) work.add(id)
  }
  visitMilestone(milestone)
  const visitWork = (id: string) => {
    const item = plan.work.find((item) => item.id === id)
    if (!item) throw new IntegrationError('unknown-required-work')
    for (const dependency of item.after) {
      if (!work.has(dependency)) {
        work.add(dependency)
        visitWork(dependency)
      }
    }
  }
  for (const id of [...work]) visitWork(id)
  const waves = planWaves(plan)
    .map((wave) => wave.filter((id) => work.has(id)))
    .filter((wave) => wave.length)
  const units = waves.flat().map((id) => {
    const item = plan.work.find((item) => item.id === id)
    if (!item?.repository) throw new IntegrationError('required-work-has-no-code-repository')
    return item
  })
  const criteria = [
    ...new Set(
      plan.milestones.filter((item) => milestones.has(item.id)).flatMap((item) => item.criteria),
    ),
  ].sort()
  const contracts = units
    .flatMap((unit) =>
      unit.produces.map((contract) => ({
        id: contract.id,
        revision: contract.revision,
        sha256: contract.sha256,
      })),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
  return {
    milestones: [...milestones].sort(),
    units,
    waves,
    criteria,
    contracts,
    repositories: [...new Set(units.map((unit) => unit.repository ?? ''))].sort(),
    procedure: selected.procedure,
  }
}
export function integrationRequest(value: unknown, plan: DeliveryPlan, digest: string) {
  acceptanceShape(value, schema)
  const input = structuredClone(value) as IntegrationRequest,
    scope = integrationScope(plan, input.milestone)
  if (input.run !== plan.run || input.revision !== plan.revision || input.plan !== digest)
    throw new IntegrationError('plan-binding')
  unique(
    input.parts.map((part) => part.work),
    'duplicate-part',
  )
  unique(
    input.parts.map((part) => part.path),
    'shared-part-workspace',
  )
  if (
    !same(
      input.parts.map((part) => part.work),
      scope.units.map((unit) => unit.id),
    )
  )
    throw new IntegrationError('required-part-coverage')
  for (const part of input.parts)
    if (scope.units.find((unit) => unit.id === part.work)?.repository !== part.repository)
      throw new IntegrationError('part-repository')
  unique(
    input.assemblies.map((item) => item.repository),
    'duplicate-assembly',
  )
  unique(
    input.assemblies.map((item) => item.path),
    'shared-assembly-workspace',
  )
  if (
    !same(
      input.assemblies.map((item) => item.repository),
      scope.repositories,
    ) ||
    input.assemblies.some((item) => input.parts.some((part) => part.path === item.path))
  )
    throw new IntegrationError('assembly-coverage')
  if (
    contractDigest([...input.contracts].sort((a, b) => a.id.localeCompare(b.id))) !==
    contractDigest(scope.contracts)
  )
    throw new IntegrationError('unknown-contract-revision')
  unique(
    input.repairOwners.map((owner) => owner.criterion),
    'duplicate-repair-owner',
  )
  if (
    !same(
      input.repairOwners.map((owner) => owner.criterion),
      scope.criteria,
    )
  )
    throw new IntegrationError('repair-ownership-coverage')
  for (const owner of input.repairOwners)
    if (
      owner.kind === 'integration'
        ? owner.id !== input.milestone
        : !scope.units.some(
            (unit) => unit.id === owner.id && unit.criteria.includes(owner.criterion),
          )
    )
      throw new IntegrationError('unknown-repair-owner')
  unique(
    input.inputs.map((item) => item.id),
    'duplicate-input',
  )
  const inputs = new Set(input.inputs.map((item) => item.id)),
    visiting = new Set<string>(),
    done = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new IntegrationError('input-cycle')
    if (done.has(id)) return
    const item = input.inputs.find((item) => item.id === id)
    if (!item) throw new IntegrationError('unknown-input-dependency')
    visiting.add(id)
    unique(item.after, 'duplicate-input-dependency')
    for (const dependency of item.after) visit(dependency)
    visiting.delete(id)
    done.add(id)
  }
  for (const item of input.inputs) {
    if (item.after.some((id) => !inputs.has(id)))
      throw new IntegrationError('unknown-input-dependency')
    visit(item.id)
    if (item.kind === 'gate-policy') {
      if (!item.repository || !scope.repositories.includes(item.repository) || !item.gate)
        throw new IntegrationError('gate-requirement-coverage')
    } else if (item.repository || item.gate) throw new IntegrationError('ambiguous-input-scope')
  }
  if (
    input.inputs.filter((item) => item.kind === 'acceptance').length !== 1 ||
    !input.inputs.some((item) => item.kind === 'recipe')
  )
    throw new IntegrationError('incomplete-execution-inputs')
  for (const repository of scope.repositories)
    for (const gate of ['verify', 'review'])
      if (
        input.inputs.filter(
          (item) =>
            item.kind === 'gate-policy' && item.repository === repository && item.gate === gate,
        ).length !== 1
      )
        throw new IntegrationError('gate-requirement-coverage')
  input.parts.sort(
    (a, b) =>
      scope.units.findIndex((unit) => unit.id === a.work) -
      scope.units.findIndex((unit) => unit.id === b.work),
  )
  input.assemblies.sort((a, b) => a.repository.localeCompare(b.repository))
  input.contracts.sort((a, b) => a.id.localeCompare(b.id))
  input.inputs.sort((a, b) => a.id.localeCompare(b.id))
  for (const item of input.inputs) item.after.sort()
  input.repairOwners.sort((a, b) => a.criterion.localeCompare(b.criterion))
  return { input, scope }
}
