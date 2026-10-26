import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { acceptedDecisionPlan } from '../decisions/accepted.js'
import { ENVIRONMENT_SNAPSHOT_LIMITS } from '../environment/candidates.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { IntegrationError, type IntegrationPart } from '../integration/contracts.js'
import {
  AssemblyGitProcess,
  assemblyGitArguments,
  assertAssemblyGit,
} from '../integration/git-process.js'
import { observeCommittedWorktree } from '../integration/observe.js'
import { canonicalPath, inside } from '../state/paths.js'
import { ancestor, git, registeredWorktrees, repository } from '../worktrees/git.js'
import type { EffectRecord } from './effect-events.js'
import { DeliveryEffects, type EffectHost } from './effects.js'
import { readSourceFile, safeSourceText } from './input.js'
import {
  checkPlanEnvelope,
  type DeliveryPlan,
  observePlanBases,
  planWaves,
  validateDeliveryShape,
} from './plan.js'
import recordSchema from './schemas/workspace-record-v1.json' with { type: 'json' }
import requestSchema from './schemas/workspace-request-v1.json' with { type: 'json' }
import statusSchema from './schemas/workspace-status-v1.json' with { type: 'json' }

export const DELIVERY_WORKSPACE_SCHEMAS = {
  request: requestSchema,
  record: recordSchema,
  status: statusSchema,
}
export interface DeliveryWorkspaceRequest {
  schema: 'wholeloop/delivery-workspace-request@1'
  run: string
  revision: number
  plan: string
  unit: string
  key: string
  parts: IntegrationPart[]
}
interface WorkspaceRepository {
  repository: string
  root: string
  commonDir: string
  target: string
  base: string
  branch: string
  path: string
}
export interface DeliveryWorkspaceRecord {
  schema: 'wholeloop/delivery-workspace-record@1'
  digest: string
  request: DeliveryWorkspaceRequest
  grant: string
  grantDigest: string
  source: string
  repository: WorkspaceRepository
  parts: (IntegrationPart & { snapshot: string })[]
}
type WorkspaceStep = {
  operation: 'workspace.create' | 'git.commit'
  expectedHead: string
  key: string
  part?: IntegrationPart
}
const ACTIVE = new Set(['queued', 'running', 'waiting-external'])

/** A delivery unit owns an external topic without fabricating legacy slice or human approvals. */
export class DeliveryWorkspaces {
  readonly effects: DeliveryEffects
  constructor(
    store?: string,
    readonly planAccepted?: (grant: string, plan: string) => boolean,
  ) {
    this.effects = new DeliveryEffects(store)
  }
  private get files() {
    return this.effects.lifecycle.journal.files
  }

  private authority(request: DeliveryWorkspaceRequest, observeGit = true) {
    const state = this.effects.lifecycle.journal.get(request.run),
      authority = this.effects.lifecycle.authority,
      prepared = authority.planning.getPlan(request.run, request.revision),
      grant = state.grant ? authority.inspect(state.grant.id) : undefined
    if (
      state.basis.digest !== request.plan ||
      prepared.digest !== request.plan ||
      state.source !== prepared.plan.source ||
      grant?.status !== 'active' ||
      state.grant?.digest !== grant.digest ||
      !grant.grant.effects.includes('workspace.create')
    )
      throw new IntegrationError('inactive-workspace-authority')
    if (grant.grant.basis.kind === 'envelope') {
      if (
        prepared.plan.envelope !== grant.grant.basis.digest ||
        !grant.grant.decisions.includes('delivery-plan') ||
        !(
          this.planAccepted?.(grant.digest, prepared.digest) ??
          acceptedDecisionPlan(this.files.root, grant.digest, prepared.digest)
        )
      )
        throw new IntegrationError('unaccepted-workspace-plan')
      checkPlanEnvelope(
        prepared.plan,
        authority.planning.getEnvelope(grant.grant.basis.digest).envelope,
      )
    } else if (grant.grant.basis.digest !== request.plan)
      throw new IntegrationError('workspace-grant-basis')
    if (observeGit) {
      observePlanBases(prepared.plan.repositories)
      for (const repo of prepared.plan.repositories) assertAssemblyGit(repo.root)
    }
    return { state, plan: prepared.plan, grant: grant.grant, grantDigest: grant.digest }
  }

  private predecessors(plan: DeliveryPlan, unit: string, supplied: IntegrationPart[]) {
    const selected = plan.work.find((item) => item.id === unit)
    if (!selected || selected.role === 'research' || !selected.repository)
      throw new IntegrationError('workspace-code-unit')
    const closure = (id: string, result = new Set<string>()) => {
      for (const before of plan.work.find((item) => item.id === id)?.after ?? []) {
        if (result.has(before)) continue
        result.add(before)
        closure(before, result)
      }
      return result
    }
    const required = closure(unit),
      ordered = planWaves(plan)
        .flat()
        .filter(
          (id) => required.has(id) && plan.work.find((item) => item.id === id)?.role !== 'research',
        )
    if (
      new Set(supplied.map((part) => part.work)).size !== supplied.length ||
      new Set(supplied.map((part) => part.path)).size !== supplied.length ||
      contractDigest(supplied.map((part) => part.work).sort()) !==
        contractDigest([...ordered].sort())
    )
      throw new IntegrationError('workspace-predecessor-coverage')
    const parts = ordered.map((id) => {
      const part = supplied.find((part) => part.work === id),
        work = plan.work.find((item) => item.id === id)
      if (!part || part.repository !== work?.repository)
        throw new IntegrationError('workspace-predecessor-repository')
      return observeCommittedWorktree(plan, part)
    })
    for (const part of parts)
      for (const before of parts.filter(
        (entry) => closure(part.work).has(entry.work) && entry.repository === part.repository,
      )) {
        const root = plan.repositories.find((repo) => repo.id === part.repository)?.root
        if (!root || !ancestor(root, before.head, part.head))
          throw new IntegrationError('workspace-predecessor-ancestry')
      }
    return { selected, parts }
  }

  prepare(value: unknown): DeliveryWorkspaceRecord {
    validateDeliveryShape(value, requestSchema)
    const request = structuredClone(value) as DeliveryWorkspaceRequest,
      current = this.authority(request),
      observed = this.predecessors(current.plan, request.unit, request.parts),
      declared = current.plan.repositories.find((repo) => repo.id === observed.selected.repository),
      scope = current.grant.repositories.find(
        (repo) => repo.repository === observed.selected.repository,
      )
    if (!current.plan.definition.ready || !declared || !scope)
      throw new IntegrationError('workspace-repository-authority')
    if (
      observed.parts.some((part) => part.repository === declared.id) &&
      !current.grant.effects.includes('git.commit')
    )
      throw new IntegrationError('workspace-predecessor-merge-authority')
    request.parts = observed.parts.map(({ snapshot: _snapshot, ...part }) => part)
    const seed = contractDigest({
        request,
        grantDigest: current.grantDigest,
        parts: observed.parts,
      }),
      binding = {
        request,
        grant: current.grant.id,
        grantDigest: current.grantDigest,
        source: current.plan.source,
        repository: {
          repository: declared.id,
          root: declared.root,
          commonDir: repository(declared.root).commonDir,
          target: declared.target,
          base: declared.base,
          branch: `${scope.topicPrefix.replace(/\/$/, '')}/work-${seed.slice(0, 32)}`,
          path: canonicalPath(
            join(this.files.path('delivery/topic-worktrees'), seed, request.unit),
          ),
        },
        parts: observed.parts,
      },
      digest = contractDigest(binding),
      record: DeliveryWorkspaceRecord = {
        schema: 'wholeloop/delivery-workspace-record@1',
        digest,
        ...binding,
      }
    validateDeliveryShape(record, recordSchema)
    safeSourceText(JSON.stringify(record), 2 * 1024 * 1024)
    this.files.locked(() => {
      const index = this.index(request),
        previous = this.indexValue(request)
      if (previous !== undefined && previous !== `${digest}\n`)
        throw new IntegrationError('workspace-already-bound')
      if (existsSync(this.files.path(this.path(digest)))) this.get(digest)
      else this.files.atomic(this.path(digest), `${JSON.stringify(record)}\n`)
      if (previous === undefined) this.files.atomic(index, `${digest}\n`)
    })
    return record
  }
  private path(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new IntegrationError('workspace-digest')
    return `delivery/workspaces/${digest}.json`
  }
  private index(request: DeliveryWorkspaceRequest) {
    return `delivery/workspace-units/${request.run}/${request.plan}/${request.unit}.txt`
  }
  private indexValue(request: DeliveryWorkspaceRequest) {
    const path = this.index(request)
    return existsSync(this.files.path(path))
      ? readSourceFile(this.files.root, path, 128)
      : undefined
  }
  get(digest: string): DeliveryWorkspaceRecord {
    const value = JSON.parse(
      readSourceFile(this.files.root, this.path(digest), 2 * 1024 * 1024),
    ) as DeliveryWorkspaceRecord
    validateDeliveryShape(value, recordSchema)
    const { schema: _schema, digest: actual, ...binding } = value
    if (actual !== digest || contractDigest(binding) !== digest)
      throw new IntegrationError('changed-workspace-record')
    return value
  }
  private current(record: DeliveryWorkspaceRecord) {
    const current = this.authority(record.request)
    if (
      current.grant.id !== record.grant ||
      current.grantDigest !== record.grantDigest ||
      this.indexValue(record.request) !== `${record.digest}\n` ||
      contractDigest(
        this.predecessors(current.plan, record.request.unit, record.request.parts).parts,
      ) !== contractDigest(record.parts)
    )
      throw new IntegrationError('changed-workspace-inputs')
    return current
  }
  private find(record: DeliveryWorkspaceRecord, step: WorkspaceStep): EffectRecord | undefined {
    return this.effects.inspect(record.request.run).find((effect) => effect.intent.key === step.key)
  }
  private steps(record: DeliveryWorkspaceRecord) {
    const prefix = `workspace-${record.digest.slice(0, 24)}`,
      steps: WorkspaceStep[] = [
        {
          key: `${prefix}-create`,
          operation: 'workspace.create',
          expectedHead: record.repository.base,
        },
      ]
    let head = record.repository.base
    for (const part of record.parts.filter(
      (part) => part.repository === record.repository.repository,
    )) {
      // The previous native result, rather than predicted Git hashes, supplies the next precondition.
      const previous = this.find(record, steps[steps.length - 1] as WorkspaceStep)
      if (previous?.status !== 'applied' || !previous.observations.at(-1)?.resource?.revision) break
      head = previous.observations.at(-1)?.resource?.revision ?? head
      steps.push({
        key: `${prefix}-${contractDigest(part.work).slice(0, 12)}`,
        operation: 'git.commit',
        expectedHead: head,
        part,
      })
    }
    return steps
  }
  private owned(record: DeliveryWorkspaceRecord, head: string, clean = true) {
    const repo = record.repository,
      tree = registeredWorktrees(repo.root).find((item) => item.path === repo.path)
    if (
      canonicalPath(repo.path) !== repo.path ||
      !inside(this.files.root, repo.path) ||
      tree?.branch !== `refs/heads/${repo.branch}` ||
      tree.locked ||
      repository(repo.path).commonDir !== repo.commonDir ||
      git(repo.path, ['rev-parse', 'HEAD']).trim() !== head ||
      (clean && git(repo.path, ['status', '--porcelain=v1', '--untracked-files=all']).trim())
    )
      throw new IntegrationError('changed-owned-workspace')
  }
  private host(record: DeliveryWorkspaceRecord, step: WorkspaceStep): EffectHost {
    const repo = record.repository,
      hooks = this.files.path('delivery/workspace-hooks'),
      owner = this.effects.lifecycle.authority.planning.getPlan(
        record.request.run,
        record.request.revision,
      ).plan.owner
    mkdirSync(hooks, { recursive: true, mode: 0o700 })
    const args = assemblyGitArguments(
        hooks,
        owner,
        step.operation === 'workspace.create'
          ? ['worktree', 'add', '-b', repo.branch, '--', repo.path, repo.base]
          : [
              'merge',
              '--no-ff',
              '--no-edit',
              '--no-stat',
              '-m',
              'chore(build): include approved committed predecessors',
              '-m',
              'Prepare the owned unit from the complete pinned code dependency vector.',
              step.part?.head ?? '',
            ],
      ),
      cwd = step.operation === 'workspace.create' ? repo.root : repo.path,
      native = (invocation: string) =>
        new AssemblyGitProcess(
          this.files,
          `delivery/workspace-operations/${record.digest}/${invocation}`,
        )
    const check = () => {
      const current = this.current(record)
      if (!ACTIVE.has(current.state.state)) throw new IntegrationError('workspace-state-fenced')
      if (step.operation === 'workspace.create') {
        if (
          existsSync(repo.path) ||
          git(repo.root, [
            'for-each-ref',
            '--format=%(refname)',
            `refs/heads/${repo.branch}`,
          ]).trim()
        )
          throw new IntegrationError('occupied-delivery-workspace')
      } else this.owned(record, step.expectedHead)
    }
    return {
      eligible: () => {
        check()
        return {
          allowed: true,
          provenance: 'host-observed',
          evidence: contractDigest({ workspace: record.digest, step, args }),
        }
      },
      invoke: async (intent, invocation, signal) => {
        check()
        mkdirSync(dirname(repo.path), { recursive: true, mode: 0o700 })
        await native(invocation).invoke(
          cwd,
          args,
          this.effects.get(record.request.run, intent.id).deadline ?? '',
          signal,
          () => {
            // Creation changes its own path precondition. Live authority is still required until the exact group closes.
            const current = this.authority(record.request, false)
            if (current.grantDigest !== record.grantDigest || !ACTIVE.has(current.state.state))
              throw new IntegrationError('workspace-state-fenced')
          },
        )
      },
      observe: async (intent, invocation) => {
        const observed = native(invocation).observe(args, cwd),
          base = {
            binding: contractDigest(intent),
            provenance: 'host-observed' as const,
            evidence: observed?.evidence ?? contractDigest({ invocation, closed: false }),
          }
        if (!observed)
          return {
            available: true,
            value: {
              ...base,
              status: 'unknown' as const,
              invocationState: 'unknown' as const,
              reason: 'unavailable-read' as const,
            },
          }
        if (observed.code !== 0)
          return {
            available: true,
            value: {
              ...base,
              status: 'not-applied' as const,
              invocationState: 'stopped' as const,
              reason: 'observed' as const,
            },
          }
        try {
          this.current(record)
          const head = git(repo.path, ['rev-parse', 'HEAD']).trim()
          this.owned(record, head)
          if (
            step.operation === 'workspace.create'
              ? head !== repo.base
              : !step.part ||
                !ancestor(repo.root, step.expectedHead, head) ||
                !ancestor(repo.root, step.part.head, head)
          )
            throw new IntegrationError('workspace-result-binding')
          return {
            available: true,
            value: {
              ...base,
              status: 'applied' as const,
              invocationState: 'stopped' as const,
              reason: 'observed' as const,
              resource: { ref: intent.ref, revision: head },
            },
          }
        } catch {
          return {
            available: true,
            value: {
              ...base,
              status: 'unknown' as const,
              invocationState: 'stopped' as const,
              reason: 'binding-mismatch' as const,
            },
          }
        }
      },
    }
  }
  async execute(digest: string) {
    const record = this.get(digest)
    this.current(record)
    while (true) {
      const step = this.steps(record).find(
        (entry) => this.find(record, entry)?.status !== 'applied',
      )
      if (!step) return this.inspect(digest)
      let effect = this.find(record, step)
      if (effect?.status === 'not-applied' || effect?.status === 'abandoned')
        return this.inspect(digest)
      if (effect && ['pending', 'unknown'].includes(effect.status)) {
        // Reading the original result cannot authorize the next mutation. Explicit execution resumes only when queued.
        effect = await this.effects.reconcile(
          record.request.run,
          effect.intent.id,
          this.host(record, step),
        )
      } else {
        if (
          this.effects
            .inspect(record.request.run)
            .some((entry) => ['pending', 'unknown'].includes(entry.status))
        )
          throw new IntegrationError('unresolved-workspace-effect')
        effect ??= this.effects.prepare(record.request.run, {
          key: step.key,
          operation: step.operation,
          repository: record.repository.repository,
          ref: record.repository.branch,
          expectedHead: step.expectedHead,
          inputDigest: contractDigest({ workspace: digest, step }),
        })
        effect = await this.effects.execute(
          record.request.run,
          effect.intent.id,
          this.host(record, step),
        )
      }
      const state = this.effects.lifecycle.journal.get(record.request.run)
      if (
        state.state === 'waiting-external' &&
        !this.effects
          .inspect(record.request.run)
          .some((entry) => ['pending', 'unknown'].includes(entry.status))
      ) {
        this.current(record)
        this.effects.lifecycle.transition(record.request.run, {
          to: 'queued',
          reason:
            'The original owned workspace operation is positively closed; continue the explicitly requested preparation.',
        })
      }
      if (effect.status !== 'applied') return this.inspect(digest)
    }
  }
  async reconcile(digest: string) {
    const record = this.get(digest)
    for (const step of this.steps(record)) {
      const effect = this.find(record, step)
      if (effect && ['pending', 'unknown'].includes(effect.status))
        await this.effects.reconcile(record.request.run, effect.intent.id, this.host(record, step))
    }
    return this.inspect(digest)
  }
  inspect(digest: string) {
    const record = this.get(digest),
      steps = this.steps(record),
      effects = steps.map((step) => this.find(record, step)),
      expected =
        1 + record.parts.filter((part) => part.repository === record.repository.repository).length
    let current = true,
      head: string | null = null,
      snapshot: string | null = null
    try {
      const active = this.current(record)
      if (!ACTIVE.has(active.state.state)) current = false
      if (effects.length === expected && effects.every((effect) => effect?.status === 'applied')) {
        head = effects.at(-1)?.observations.at(-1)?.resource?.revision ?? null
        if (!head) throw new IntegrationError('workspace-unobserved-head')
        this.owned(record, head, false)
        snapshot = workspaceSnapshot(record.repository.path, ENVIRONMENT_SNAPSHOT_LIMITS).digest
      }
    } catch {
      current = false
    }
    const result = {
      schema: 'wholeloop/delivery-workspace-status@1' as const,
      digest,
      record,
      current,
      status: !current
        ? ('stale' as const)
        : effects.some(
              (effect) => effect && ['pending', 'unknown', 'abandoned'].includes(effect.status),
            )
          ? ('unknown' as const)
          : effects.some((effect) => effect?.status === 'not-applied')
            ? ('failed' as const)
            : head
              ? ('ready' as const)
              : ('not-run' as const),
      ...(head ? { head } : {}),
      ...(snapshot ? { snapshot } : {}),
      effects: effects
        .filter((effect): effect is EffectRecord => effect !== undefined)
        .map((effect) => effect.intent.id),
      acceptance: 'not-established' as const,
      publication: 'not-performed' as const,
    }
    validateDeliveryShape(result, statusSchema)
    return result
  }
}
