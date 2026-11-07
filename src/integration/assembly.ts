// Assembles committed parts into an integration worktree, with each Git effect owned separately.
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { acceptedDecisionPlan } from '../decisions/accepted.js'
import { findBudget } from '../delivery/budget-events.js'
import { DeliveryBudgets } from '../delivery/budgets.js'
import type { EffectRecord } from '../delivery/effect-events.js'
import { DeliveryEffects, type EffectHost } from '../delivery/effects.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import { ancestor, git, registeredWorktrees, repository } from '../worktrees/git.js'
import { IntegrationError, type IntegrationPart, integrationScope } from './contracts.js'
import {
  type AssemblyGitControl,
  AssemblyGitProcess,
  assemblyGitArguments,
  assertAssemblyGit,
} from './git-process.js'
import { observeRequiredParts } from './parts.js'
import recordSchema from './schemas/assembly-record-v1.json' with { type: 'json' }
import requestSchema from './schemas/assembly-request-v1.json' with { type: 'json' }
import statusSchema from './schemas/assembly-status-v1.json' with { type: 'json' }

export const ASSEMBLY_REQUEST_SCHEMA = requestSchema
export const ASSEMBLY_RECORD_SCHEMA = recordSchema
export const ASSEMBLY_STATUS_SCHEMA = statusSchema
export interface AssemblyRequest {
  schema: 'wholeloop/integration-assembly-request@1'
  run: string
  revision: number
  plan: string
  milestone: string
  key: string
  parts: IntegrationPart[]
  repairOf?: string
}
interface AssemblyRepository {
  repository: string
  root: string
  commonDir: string
  target: string
  base: string
  branch: string
  path: string
  parts: string[]
}
export interface AssemblyRecord {
  schema: 'wholeloop/integration-assembly-record@1'
  digest: string
  assembly: {
    schema: 'wholeloop/integration-assembly@1'
    request: AssemblyRequest
    source: string
    grant: string
    grantDigest: string
    parts: (IntegrationPart & { snapshot: string })[]
    repositories: AssemblyRepository[]
  }
}
type Step = {
  operation: 'workspace.create' | 'git.commit'
  repository: AssemblyRepository
  expectedHead: string
  part?: IntegrationPart
  key: string
}
/** Effects own each Git mutation separately. Existing issued commands are observed, never replayed. */
export class IntegrationAssembly {
  readonly effects: DeliveryEffects
  readonly files: StoreFiles
  constructor(
    store?: string,
    readonly planAccepted?: (grant: string, plan: string) => boolean,
    readonly control?: AssemblyGitControl,
  ) {
    this.effects = new DeliveryEffects(store)
    this.files = this.effects.lifecycle.journal.files
  }
  private controller() {
    if (
      this.control &&
      (this.control.signal.aborted ||
        !Number.isFinite(Date.parse(this.control.deadline)) ||
        Date.parse(this.control.deadline) <= Date.now() ||
        !this.control.current())
    )
      throw new IntegrationError('assembly-controller-fenced')
  }
  private authority(request: AssemblyRequest, observeGit = true) {
    const state = this.effects.lifecycle.journal.view(request.run),
      prepared = this.effects.lifecycle.authority.planning.getPlan(request.run, request.revision)
    const observed = state.grant
      ? this.effects.lifecycle.authority.inspect(state.grant.id)
      : undefined
    if (
      prepared.digest !== request.plan ||
      state.basis.digest !== request.plan ||
      state.plans.at(-1)?.digest !== request.plan ||
      state.source !== prepared.plan.source ||
      observed?.status !== 'active' ||
      observed.digest !== state.grant?.digest ||
      !observed.grant.effects.includes('workspace.create') ||
      !observed.grant.effects.includes('git.commit')
    )
      throw new IntegrationError('inactive-assembly-authority')
    if (
      observed.grant.basis.kind === 'envelope' &&
      (prepared.plan.envelope !== observed.grant.basis.digest ||
        !observed.grant.decisions.includes('delivery-plan') ||
        !(
          this.planAccepted?.(observed.digest, prepared.digest) ??
          acceptedDecisionPlan(this.files.root, observed.digest, prepared.digest)
        ))
    )
      throw new IntegrationError('unaccepted-derived-assembly-plan')
    if (observeGit) for (const repo of prepared.plan.repositories) assertAssemblyGit(repo.root)
    return { state, plan: prepared.plan, grant: observed.grant, grantDigest: observed.digest }
  }
  prepare(value: unknown): AssemblyRecord {
    this.controller()
    acceptanceShape(value, requestSchema)
    const request = structuredClone(value) as AssemblyRequest,
      { plan, grant, grantDigest } = this.authority(request),
      observed = observeRequiredParts(plan, request.milestone, request.parts)
    request.parts = observed.parts.map(({ snapshot: _snapshot, ...part }) => part)
    const seed = contractDigest({ request, grantDigest, parts: observed.parts })
    const repositories = observed.scope.repositories.map((id) => {
      const repo = plan.repositories.find((r) => r.id === id),
        scope = grant.repositories.find((r) => r.repository === id)
      if (!repo || !scope) throw new IntegrationError('assembly-repository-authority')
      return {
        repository: id,
        root: repo.root,
        commonDir: repository(repo.root).commonDir,
        target: repo.target,
        base: repo.base,
        branch: `${scope.topicPrefix.replace(/\/$/, '')}/integration-${seed.slice(0, 24)}-${contractDigest(id).slice(0, 12)}`,
        path: canonicalPath(join(this.files.path('delivery/assembly-worktrees'), seed, id)),
        parts: observed.parts.filter((p) => p.repository === id).map((p) => p.work),
      }
    })
    const assembly: AssemblyRecord['assembly'] = {
        schema: 'wholeloop/integration-assembly@1',
        request,
        source: plan.source,
        grant: grant.id,
        grantDigest,
        parts: observed.parts,
        repositories,
      },
      digest = contractDigest(assembly),
      record: AssemblyRecord = {
        schema: 'wholeloop/integration-assembly-record@1',
        digest,
        assembly,
      }
    acceptanceShape(record, recordSchema)
    safeSourceText(JSON.stringify(record), 2 * 1024 * 1024)
    this.files.locked(() => {
      const path = this.path(digest),
        index = `delivery/assembly-bases/${request.run}/${request.plan}/${request.milestone}.json`,
        history: unknown = existsSync(this.files.path(index))
          ? JSON.parse(readSourceFile(this.files.root, index, 65536))
          : []
      if (
        !Array.isArray(history) ||
        history.length > 1000 ||
        history.some((id) => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) ||
        new Set(history).size !== history.length
      )
        throw new IntegrationError('changed-assembly-history')
      if (existsSync(this.files.path(path))) this.get(digest)
      if (history.includes(digest)) return
      if (history.length && request.repairOf !== history.at(-1))
        throw new IntegrationError('assembly-repair-basis-required')
      if (request.repairOf) {
        const previous = this.get(request.repairOf)
        if (
          previous.assembly.request.plan !== request.plan ||
          previous.assembly.request.milestone !== request.milestone ||
          previous.assembly.request.run !== request.run
        )
          throw new IntegrationError('unrelated-assembly-repair')
      }
      if (history.some((id) => this.get(id).assembly.request.key === request.key))
        throw new IntegrationError('assembly-key-conflict')
      if (!existsSync(this.files.path(path))) this.files.atomic(path, `${JSON.stringify(record)}\n`)
      this.files.atomic(index, `${JSON.stringify([...history, digest])}\n`)
    })
    return record
  }
  get(digest: string): AssemblyRecord {
    const record = JSON.parse(
      readSourceFile(this.files.root, this.path(digest), 2 * 1024 * 1024),
    ) as AssemblyRecord
    acceptanceShape(record, recordSchema)
    if (record.digest !== digest || contractDigest(record.assembly) !== digest)
      throw new IntegrationError('changed-assembly-record')
    return record
  }
  private path(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new IntegrationError('invalid-assembly-id')
    return `delivery/assemblies/${digest}/record.json`
  }
  private latest(record: AssemblyRecord) {
    const request = record.assembly.request
    const history = JSON.parse(
      readSourceFile(
        this.files.root,
        `delivery/assembly-bases/${request.run}/${request.plan}/${request.milestone}.json`,
        65536,
      ),
    ) as unknown
    if (!Array.isArray(history) || history.at(-1) !== record.digest)
      throw new IntegrationError('superseded-assembly')
  }
  private current(record: AssemblyRecord) {
    const { plan, grant, grantDigest, state } = this.authority(record.assembly.request)
    this.latest(record)
    if (
      grant.id !== record.assembly.grant ||
      grantDigest !== record.assembly.grantDigest ||
      contractDigest(
        observeRequiredParts(plan, record.assembly.request.milestone, record.assembly.request.parts)
          .parts,
      ) !== contractDigest(record.assembly.parts)
    )
      throw new IntegrationError('changed-assembly-inputs')
    return { plan, state }
  }
  private steps(record: AssemblyRecord, effects: ReadonlyMap<string, EffectRecord>) {
    const steps: Step[] = [],
      heads = new Map(record.assembly.repositories.map((repo) => [repo.repository, repo.base]))
    const prefix = (repo: AssemblyRepository) =>
      `assembly-${record.digest.slice(0, 24)}-${contractDigest(repo.repository).slice(0, 8)}`
    for (const repo of record.assembly.repositories)
      steps.push({
        repository: repo,
        operation: 'workspace.create',
        expectedHead: repo.base,
        key: `${prefix(repo)}-create`,
      })
    // The complete work vector is already ordered by approved dependency waves.
    // Grouping merges by repository could run a cross-repository consumer first.
    for (const part of record.assembly.parts) {
      const repo = record.assembly.repositories.find((repo) => repo.repository === part.repository),
        head = heads.get(part.repository)
      if (!repo || !head) throw new IntegrationError('missing-assembly-part')
      const step: Step = {
        repository: repo,
        operation: 'git.commit',
        expectedHead: head,
        part,
        key: `${prefix(repo)}-${contractDigest(part.work).slice(0, 12)}`,
      }
      steps.push(step)
      const prior = effects.get(step.key),
        revision = prior?.observations.at(-1)?.resource?.revision
      if (prior?.status !== 'applied' || !revision) break
      heads.set(part.repository, revision)
    }
    return steps
  }
  private effectIndex(record: AssemblyRecord) {
    // This vector belongs to one synchronous selection. Every effect boundary
    // starts another observation rather than retaining authority across work.
    const indexed = new Map<string, EffectRecord>()
    // Keys can recur on a later plan basis; retain the original find-first semantics.
    for (const effect of this.effects.inspect(record.assembly.request.run))
      if (!indexed.has(effect.intent.key)) indexed.set(effect.intent.key, effect)
    return indexed
  }
  private owned(repo: AssemblyRepository, expectedHead: string, clean = true) {
    const registered = registeredWorktrees(repo.root).find((t) => t.path === repo.path)
    if (
      registered?.branch !== `refs/heads/${repo.branch}` ||
      registered.locked ||
      repository(repo.path).commonDir !== repo.commonDir ||
      git(repo.path, ['rev-parse', 'HEAD']).trim() !== expectedHead ||
      (clean && git(repo.path, ['status', '--porcelain=v1', '--untracked-files=all']).trim())
    )
      throw new IntegrationError('changed-owned-assembly')
  }
  private host(record: AssemblyRecord, step: Step): EffectHost {
    const repo = step.repository,
      hooks = this.files.path(`delivery/assembly-hooks`),
      request = record.assembly.request
    mkdirSync(hooks, { recursive: true, mode: 0o700 })
    const args = assemblyGitArguments(
      hooks,
      this.effects.lifecycle.authority.planning.getPlan(request.run, request.revision).plan.owner,
      step.operation === 'workspace.create'
        ? ['worktree', 'add', '-b', repo.branch, '--', repo.path, repo.base]
        : [
            'merge',
            '--no-ff',
            '--no-edit',
            '--no-stat',
            '-m',
            'chore(integration): assemble a required committed part',
            '-m',
            'Bind the approved milestone to its complete committed predecessor set.',
            step.part?.head ?? '',
          ],
    )
    const cwd = step.operation === 'workspace.create' ? repo.root : repo.path
    const check = () => {
      if (canonicalPath(repo.path) !== repo.path || !inside(this.files.root, repo.path))
        throw new IntegrationError('changed-assembly-path')
      const { state } = this.current(record)
      if (!['queued', 'running', 'waiting-external'].includes(state.state))
        throw new IntegrationError('assembly-state-fenced')
      if (step.operation === 'workspace.create') {
        if (
          existsSync(repo.path) ||
          git(repo.root, [
            'for-each-ref',
            '--format=%(refname)',
            `refs/heads/${repo.branch}`,
          ]).trim()
        )
          throw new IntegrationError('occupied-assembly-workspace')
      } else this.owned(repo, step.expectedHead)
    }
    return {
      eligible: () => {
        this.controller()
        check()
        return {
          allowed: true,
          provenance: 'host-observed',
          evidence: contractDigest({ record: record.digest, step, args }),
        }
      },
      invoke: async (intent, invocation, signal) => {
        check()
        const effect = this.effects.get(request.run, intent.id)
        mkdirSync(dirname(repo.path), { recursive: true, mode: 0o700 })
        await new AssemblyGitProcess(
          this.files,
          `delivery/assemblies/${record.digest}/operations/${invocation}`,
        ).invoke(
          cwd,
          args,
          effect.deadline ?? '',
          signal,
          () => {
            // A create command changes its own precondition; live authority/input checks remain valid throughout it.
            this.latest(record)
            const { state, grant, grantDigest } = this.authority(record.assembly.request, false)
            if (grant.id !== record.assembly.grant || grantDigest !== record.assembly.grantDigest)
              throw new IntegrationError('changed-assembly-grant')
            if (!['queued', 'running', 'waiting-external'].includes(state.state))
              throw new IntegrationError('assembly-state-fenced')
          },
          this.control,
        )
      },
      observe: async (intent, invocation) => {
        const observed = new AssemblyGitProcess(
          this.files,
          `delivery/assemblies/${record.digest}/operations/${invocation}`,
        ).observe(args, cwd)
        const base = {
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
          const head = git(repo.path, ['rev-parse', 'HEAD']).trim()
          this.owned(repo, head)
          if (
            step.operation === 'workspace.create'
              ? head !== repo.base
              : !step.part ||
                !ancestor(repo.root, step.part.head, head) ||
                !ancestor(repo.root, step.expectedHead, head)
          )
            throw new IntegrationError('assembly-result-binding')
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
              invocationState: 'unknown' as const,
              reason: 'binding-mismatch' as const,
            },
          }
        }
      },
    }
  }
  async execute(digest: string) {
    this.controller()
    const record = this.get(digest),
      request = record.assembly.request
    this.current(record)
    if (request.repairOf) {
      const budget = new DeliveryBudgets(this.files.root)
      budget.repair(request.run, {
        key: `assembly-${digest}`,
        kind: 'integration-repair',
        evidence: digest,
        provenance: 'host-observed',
      })
      if (
        !findBudget(this.effects.lifecycle.journal.view(request.run))?.counters.some(
          (c) => c.key === `assembly-${digest}`,
        )
      )
        throw new IntegrationError('integration-repair-budget')
    }
    while (true) {
      const effects = this.effectIndex(record),
        steps = this.steps(record, effects),
        step = steps.find((step) => effects.get(step.key)?.status !== 'applied')
      if (!step) return this.inspect(digest)
      let effect = effects.get(step.key)
      if (effect?.status === 'not-applied' || effect?.status === 'abandoned')
        return this.inspect(digest)
      const host = this.host(record, step)
      if (effect && ['pending', 'unknown'].includes(effect.status))
        effect = await this.effects.reconcile(request.run, effect.intent.id, host)
      else {
        this.controller()
        if (
          this.effects.inspect(request.run).some((e) => ['pending', 'unknown'].includes(e.status))
        )
          throw new IntegrationError('unresolved-assembly-effect')
        const state = this.effects.lifecycle.journal.view(request.run)
        if (!['queued', 'running'].includes(state.state))
          throw new IntegrationError('assembly-not-queued')
        effect ??= this.effects.prepare(request.run, {
          key: step.key,
          operation: step.operation,
          repository: step.repository.repository,
          ref: step.repository.branch,
          expectedHead: step.expectedHead,
          inputDigest: contractDigest({ assembly: digest, step }),
        })
        effect = await this.effects.execute(request.run, effect.intent.id, host)
      }
      const state = this.effects.lifecycle.journal.view(request.run)
      if (
        state.state === 'waiting-external' &&
        !this.effects.inspect(request.run).some((e) => ['pending', 'unknown'].includes(e.status))
      )
        this.effects.lifecycle.transition(request.run, {
          to: 'queued',
          reason:
            'Observed owned assembly step completed; continue the original approved milestone.',
        })
      if (effect.status !== 'applied') return this.inspect(digest)
    }
  }
  async reconcile(digest: string) {
    const record = this.get(digest)
    while (true) {
      const effects = this.effectIndex(record),
        step = this.steps(record, effects).find((step) => {
          const effect = effects.get(step.key)
          return effect && ['pending', 'unknown'].includes(effect.status)
        })
      if (!step) break
      const effect = effects.get(step.key)
      if (!effect) break
      const observed = await this.effects.reconcile(
        record.assembly.request.run,
        effect.intent.id,
        this.host(record, step),
      )
      if (observed.status === 'unknown' || observed.status === 'pending') break
    }
    return this.inspect(digest)
  }
  requestCancellation(digest: string) {
    const record = this.get(digest)
    let effects = this.effectIndex(record)
    for (const step of this.steps(record, effects)) {
      const effect = effects.get(step.key)
      if (effect?.invocation && ['pending', 'unknown'].includes(effect.status)) {
        new AssemblyGitProcess(
          this.files,
          `delivery/assemblies/${record.digest}/operations/${effect.invocation}`,
        ).requestCancellation()
        effects = this.effectIndex(record)
      }
    }
  }
  inspect(digest: string) {
    const record = this.get(digest),
      effects = this.effectIndex(record),
      steps = this.steps(record, effects)
    let stale = false
    try {
      this.current(record)
    } catch {
      stale = true
    }
    const repositories = record.assembly.repositories.map((repo) => {
      const selected = steps.filter((s) => s.repository.repository === repo.repository),
        results = selected.map((s) => effects.get(s.key)),
        last = results.at(-1),
        head = last?.observations.at(-1)?.resource?.revision
      let status: 'not-run' | 'assembled' | 'conflict' | 'failed' | 'unknown' | 'stale' = 'not-run'
      if (results.some((e) => e && ['pending', 'unknown', 'abandoned'].includes(e.status)))
        status = 'unknown'
      else if (results.some((e) => e?.status === 'not-applied')) {
        status = 'failed'
        const failedIndex = results.findIndex((e) => e?.status === 'not-applied'),
          failedStep = selected[failedIndex]
        try {
          if (failedStep?.part) {
            this.owned(repo, failedStep.expectedHead, false)
            if (
              git(repo.path, ['ls-files', '--unmerged', '-z']).length &&
              git(repo.path, ['rev-parse', '--verify', 'MERGE_HEAD']).trim() ===
                failedStep.part.head
            )
              status = 'conflict'
          }
        } catch {
          /* Retain an ordinary Git failure without inventing a merge conflict. */
        }
      } else if (
        results.every((e) => e?.status === 'applied') &&
        selected.length === repo.parts.length + 1
      )
        status = 'assembled'
      if (status === 'assembled')
        try {
          this.owned(repo, head ?? '')
        } catch {
          status = 'stale'
        }
      return {
        repository: repo.repository,
        path: repo.path,
        ref: `refs/heads/${repo.branch}`,
        status,
        ...(head ? { head } : {}),
        effects: results.filter((e): e is EffectRecord => e !== undefined).map((e) => e.intent.id),
      }
    })
    const all = repositories.every((r) => r.status === 'assembled'),
      any = repositories.some((r) => r.status === 'assembled'),
      failed = repositories.some((r) => r.status === 'conflict' || r.status === 'failed'),
      conflict = repositories.some((r) => r.status === 'conflict'),
      unknown = repositories.some((r) => r.status === 'unknown')
    const result = {
      schema: 'wholeloop/integration-assembly-status@1' as const,
      digest,
      record,
      status:
        stale || repositories.some((r) => r.status === 'stale')
          ? 'stale'
          : all
            ? 'assembled'
            : unknown
              ? 'unknown'
              : any
                ? 'partial'
                : failed
                  ? conflict
                    ? 'conflict'
                    : 'failed'
                  : 'not-run',
      repositories,
      ...(failed
        ? {
            repair: {
              kind: 'integration',
              owner: record.assembly.request.milestone,
              criteria: integrationScope(
                this.effects.lifecycle.authority.planning.getPlan(
                  record.assembly.request.run,
                  record.assembly.request.revision,
                ).plan,
                record.assembly.request.milestone,
              ).criteria,
              basis: digest,
            },
          }
        : {}),
      acceptance: 'not-established' as const,
      publication: 'not-performed' as const,
      rollback: 'not-performed' as const,
    }
    acceptanceShape(result, statusSchema)
    return result
  }
}
