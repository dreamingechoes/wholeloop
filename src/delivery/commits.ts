import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { ENVIRONMENT_SNAPSHOT_LIMITS } from '../environment/candidates.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { checkCommit } from '../git/commit.js'
import {
  type AssemblyGitControl,
  AssemblyGitProcess,
  assemblyGitArguments,
} from '../integration/git-process.js'
import { canonicalPath, inside } from '../state/paths.js'
import { git, registeredWorktrees, repository, repositoryControl } from '../worktrees/git.js'
import { candidateFiles, candidateIndex } from './candidate-files.js'
import {
  CANDIDATE_COMMIT_SCHEMAS,
  CandidateCommitError,
  type CandidateCommitReceipt,
  type CandidateCommitRecord,
  type CandidateCommitRequest,
  candidateCommitKey,
  commitReceiptPath,
  commitRecordPath,
  currentWorkspaceCommit,
  readCandidateCommit,
  readCommitReceipt,
  validateWorkspaceCommit,
  workspaceCommitEffects,
  workspaceCommitPath,
} from './commit-state.js'
import type { EffectRecord } from './effect-events.js'
import type { DeliveryEffects, EffectHost } from './effects.js'
import { readSourceFile, safeSourceText } from './input.js'
import { validateDeliveryShape } from './plan.js'
import { type DeliveryWorkspaceRecord, DeliveryWorkspaces } from './workspaces.js'

type CommitStep = 'stage' | 'commit'
const ACTIVE = new Set(['queued', 'running', 'waiting-external'])

/** Staging and commit are separate owned effects. Neither a clean message nor a Git commit satisfies QA. */
export class DeliveryCommits {
  readonly workspaces: DeliveryWorkspaces
  readonly effects: DeliveryEffects
  constructor(
    store?: string,
    readonly control?: AssemblyGitControl,
  ) {
    this.workspaces = new DeliveryWorkspaces(store, undefined, control)
    this.effects = this.workspaces.effects
  }
  private get files() {
    return this.effects.lifecycle.journal.files
  }
  private keyPath(request: CandidateCommitRequest) {
    return `delivery/commit-keys/${request.workspace}/${request.key}.txt`
  }
  prepare(value: unknown): CandidateCommitRecord {
    validateDeliveryShape(value, CANDIDATE_COMMIT_SCHEMAS.request)
    const request = structuredClone(value) as CandidateCommitRequest
    if (checkCommit(request.message).length) throw new CandidateCommitError('message-hygiene')
    safeSourceText(request.message, 16384)
    return this.files.locked(() => {
      const path = this.keyPath(request)
      if (existsSync(this.files.path(path))) {
        const retained = this.get(readSourceFile(this.files.root, path, 128).trim())
        this.allocation(retained)
        if (contractDigest(retained.request) !== contractDigest(request))
          throw new CandidateCommitError('key-conflict')
        return retained
      }
      const status = this.workspaces.inspect(request.workspace),
        allocation = this.workspaces.allocation(request.workspace)
      this.permissions(allocation)
      if (
        status.status !== 'ready' ||
        !status.current ||
        status.head !== request.head ||
        status.snapshot !== request.snapshot
      )
        throw new CandidateCommitError('candidate-not-current')
      const directory = this.files.path(`delivery/commit-keys/${request.workspace}`),
        count = existsSync(directory) ? readdirSync(directory).length : 0,
        grant = this.effects.lifecycle.authority.inspect(allocation.grant).grant
      if (count >= grant.effectLimit) throw new CandidateCommitError('preparation-limit')
      this.owned(allocation)
      const files = candidateFiles(allocation.repository.path)
      if (
        workspaceSnapshot(allocation.repository.path, ENVIRONMENT_SNAPSHOT_LIMITS).digest !==
        request.snapshot
      )
        throw new CandidateCommitError('candidate-changed')
      const binding = {
          request,
          run: allocation.request.run,
          plan: allocation.request.plan,
          source: allocation.source,
          grant: allocation.grant,
          grantDigest: allocation.grantDigest,
          files,
        },
        digest = contractDigest(binding),
        record: CandidateCommitRecord = {
          schema: 'wholeloop/delivery-commit-record@1',
          digest,
          ...binding,
        }
      validateDeliveryShape(record, CANDIDATE_COMMIT_SCHEMAS.record)
      if (existsSync(this.files.path(commitRecordPath(digest)))) this.get(digest)
      else this.files.atomic(commitRecordPath(digest), `${JSON.stringify(record)}\n`)
      this.files.atomic(path, `${digest}\n`)
      return record
    })
  }
  get(digest: string) {
    return readCandidateCommit(this.effects.lifecycle, digest)
  }
  private permissions(allocation: DeliveryWorkspaceRecord) {
    const authority = this.effects.lifecycle.authority.inspect(allocation.grant)
    if (
      authority.status !== 'active' ||
      authority.digest !== allocation.grantDigest ||
      !['code.write', 'git.commit'].every((operation) =>
        authority.grant.effects.includes(operation as 'code.write' | 'git.commit'),
      )
    )
      throw new CandidateCommitError('inactive-authority')
  }
  private allocation(record: CandidateCommitRecord) {
    const allocation = this.workspaces.allocation(record.request.workspace)
    this.permissions(allocation)
    if (
      allocation.request.run !== record.run ||
      allocation.request.plan !== record.plan ||
      allocation.grant !== record.grant ||
      allocation.grantDigest !== record.grantDigest ||
      allocation.source !== record.source
    )
      throw new CandidateCommitError('allocation-binding')
    return allocation
  }
  private owned(allocation: DeliveryWorkspaceRecord) {
    const repo = allocation.repository,
      tree = registeredWorktrees(repo.root).find((item) => item.path === repo.path)
    if (
      canonicalPath(repo.path) !== repo.path ||
      !inside(this.files.root, repo.path) ||
      tree?.branch !== `refs/heads/${repo.branch}` ||
      tree.locked
    )
      throw new CandidateCommitError('workspace-ownership')
    // One query answers all three facts; without a usable answer the original
    // queries run in their original order and keep their errors (ADR-0243).
    const joined = repositoryControl(repo.path)
    if (
      (joined?.commonDir ?? repository(repo.path).commonDir) !== repo.commonDir ||
      (joined?.branch ?? git(repo.path, ['branch', '--show-current']).trim()) !== repo.branch
    )
      throw new CandidateCommitError('workspace-ownership')
    const control = joined?.gitDir ?? git(repo.path, ['rev-parse', '--absolute-git-dir']).trim()
    if (
      [
        'MERGE_HEAD',
        'CHERRY_PICK_HEAD',
        'REVERT_HEAD',
        'rebase-merge',
        'rebase-apply',
        'sequencer',
      ].some((name) => existsSync(resolve(control, name)))
    )
      throw new CandidateCommitError('git-operation-in-progress')
  }
  private before(record: CandidateCommitRecord, step: CommitStep) {
    const allocation = this.allocation(record),
      repo = allocation.repository
    this.owned(allocation)
    if (
      !ACTIVE.has(this.effects.lifecycle.journal.view(record.run).state) ||
      git(repo.path, ['rev-parse', 'HEAD']).trim() !== record.request.head ||
      contractDigest(candidateFiles(repo.path)) !== contractDigest(record.files)
    )
      throw new CandidateCommitError('candidate-changed')
    if (step === 'stage') {
      if (
        workspaceSnapshot(repo.path, ENVIRONMENT_SNAPSHOT_LIMITS).digest !== record.request.snapshot
      )
        throw new CandidateCommitError('candidate-index-changed')
    } else if (candidateIndex(repo.path) !== record.files.index)
      throw new CandidateCommitError('staged-bytes-changed')
    return allocation
  }
  private after(record: CandidateCommitRecord, step: CommitStep) {
    const allocation = this.allocation(record),
      repo = allocation.repository
    this.owned(allocation)
    if (
      contractDigest(candidateFiles(repo.path)) !== contractDigest(record.files) ||
      candidateIndex(repo.path) !== record.files.index
    )
      throw new CandidateCommitError('staged-byte-transformation')
    const head = git(repo.path, ['rev-parse', 'HEAD']).trim()
    if (step === 'stage') {
      if (head !== record.request.head) throw new CandidateCommitError('stage-head-changed')
      return record.files.index
    }
    const parents = git(repo.path, ['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/)
    if (
      parents.length !== 2 ||
      parents[0] !== head ||
      parents[1] !== record.request.head ||
      git(repo.path, ['status', '--porcelain=v1', '--untracked-files=all']).trim()
    )
      throw new CandidateCommitError('commit-result-binding')
    return head
  }
  private find(record: CandidateCommitRecord, step: CommitStep): EffectRecord | undefined {
    return this.effects
      .inspect(record.run)
      .find((effect) => effect.intent.key === candidateCommitKey(record.digest, step))
  }
  private host(record: CandidateCommitRecord, step: CommitStep): EffectHost {
    const allocation = this.workspaces.get(record.request.workspace),
      repo = allocation.repository,
      hooks = this.files.path('delivery/commit-hooks'),
      owner = this.effects.lifecycle.authority.planning.getPlan(
        record.run,
        allocation.request.revision,
      ).plan.owner
    mkdirSync(hooks, { recursive: true, mode: 0o700 })
    const args = assemblyGitArguments(
        hooks,
        owner,
        step === 'stage'
          ? ['add', '--all', '--', '.']
          : [
              'commit',
              // ADR-0208: a seeded unit whose builder changed nothing on top of
              // the previous head still records its own owned commit.
              ...(allocation.seed ? ['--allow-empty'] : []),
              '--no-verify',
              '--no-gpg-sign',
              '--cleanup=verbatim',
              '-m',
              record.request.message,
            ],
      ),
      native = (invocation: string) =>
        new AssemblyGitProcess(
          this.files,
          `delivery/commit-operations/${record.digest}/${invocation}`,
        )
    return {
      eligible: () => {
        if (this.control && !this.control.current())
          throw new CandidateCommitError('controller-fenced')
        this.before(record, step)
        return {
          allowed: true,
          provenance: 'host-observed',
          evidence: contractDigest({ record: record.digest, step, args }),
        }
      },
      invoke: async (intent, invocation, signal) => {
        this.before(record, step)
        await native(invocation).invoke(
          repo.path,
          args,
          this.effects.get(record.run, intent.id).deadline ?? '',
          signal,
          () => {
            // Staging and commit change their own index/HEAD preconditions. Original
            // authority and run fencing remain mandatory until the actual group closes.
            const state = this.effects.lifecycle.journal.view(record.run),
              grant = this.effects.lifecycle.authority.inspect(record.grant)
            if (
              state.basis.digest !== record.plan ||
              state.grant?.digest !== record.grantDigest ||
              grant.status !== 'active' ||
              grant.digest !== record.grantDigest ||
              !ACTIVE.has(state.state)
            )
              throw new CandidateCommitError('invocation-fenced')
          },
          this.control,
        )
      },
      observe: async (intent, invocation) => {
        const observed = native(invocation).observe(args, repo.path),
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
          const revision = this.after(record, step)
          return {
            available: true,
            value: {
              ...base,
              status: 'applied' as const,
              invocationState: 'stopped' as const,
              reason: 'observed' as const,
              resource: { ref: repo.branch, revision },
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
  private publish(record: CandidateCommitRecord): CandidateCommitReceipt {
    return this.files.locked(() => {
      const allocation = this.allocation(record),
        records = workspaceCommitEffects(this.effects.lifecycle, allocation),
        stage = this.find(record, 'stage'),
        committed = this.find(record, 'commit'),
        head = committed?.observations.at(-1)?.resource?.revision,
        latest = records
          .filter(
            (effect) => effect.intent.operation === 'git.commit' && effect.status === 'applied',
          )
          .sort((a, b) => b.sequence - a.sequence)[0]
      if (
        stage?.status !== 'applied' ||
        committed?.status !== 'applied' ||
        !head ||
        latest?.intent.id !== committed.intent.id ||
        records.some((effect) => ['prepared', 'pending', 'unknown'].includes(effect.status))
      )
        throw new CandidateCommitError('unpublished-or-superseded')
      this.owned(allocation)
      if (git(allocation.repository.path, ['rev-parse', 'HEAD']).trim() !== head)
        throw new CandidateCommitError('published-head-changed')
      const binding = {
          record: record.digest,
          workspace: allocation.digest,
          run: record.run,
          plan: record.plan,
          grantDigest: record.grantDigest,
          parent: record.request.head,
          head,
          files: record.files.digest,
          index: record.files.index,
          effects: { stage: stage.intent.id, commit: committed.intent.id },
        },
        digest = contractDigest(binding),
        receipt: CandidateCommitReceipt = {
          schema: 'wholeloop/delivery-commit-receipt@1',
          digest,
          ...binding,
        }
      validateWorkspaceCommit(this.effects.lifecycle, allocation, receipt)
      const path = commitReceiptPath(digest)
      if (existsSync(this.files.path(path))) {
        if (
          contractDigest(readCommitReceipt(this.effects.lifecycle, digest)) !==
          contractDigest(receipt)
        )
          throw new CandidateCommitError('receipt-conflict')
      } else this.files.atomic(path, `${JSON.stringify(receipt)}\n`)
      this.files.atomic(workspaceCommitPath(allocation.digest), `${digest}\n`)
      currentWorkspaceCommit(this.effects.lifecycle, allocation)
      return receipt
    })
  }
  async execute(digest: string) {
    const record = this.get(digest),
      allocation = this.allocation(record)
    for (const step of ['stage', 'commit'] as const) {
      let effect = this.find(record, step)
      if (effect?.status === 'applied') continue
      if (effect && ['not-applied', 'abandoned'].includes(effect.status))
        return this.inspect(digest)
      if (effect && ['pending', 'unknown'].includes(effect.status))
        effect = await this.effects.reconcile(record.run, effect.intent.id, this.host(record, step))
      else {
        effect ??= this.effects.prepare(record.run, {
          key: candidateCommitKey(record.digest, step),
          operation: step === 'stage' ? 'code.write' : 'git.commit',
          repository: allocation.repository.repository,
          ref: allocation.repository.branch,
          expectedHead: record.request.head,
          inputDigest: contractDigest({ record: record.digest, step }),
        })
        effect = await this.effects.execute(record.run, effect.intent.id, this.host(record, step))
      }
      const state = this.effects.lifecycle.journal.view(record.run)
      if (
        state.state === 'waiting-external' &&
        !this.effects
          .inspect(record.run)
          .some((entry) => ['pending', 'unknown'].includes(entry.status))
      )
        this.effects.lifecycle.transition(record.run, {
          to: 'queued',
          reason:
            'The exact owned candidate operation is positively closed; continue the requested commit.',
        })
      if (effect.status !== 'applied') return this.inspect(digest)
    }
    this.publish(record)
    return this.inspect(digest)
  }
  async reconcile(digest: string) {
    const record = this.get(digest)
    for (const step of ['stage', 'commit'] as const) {
      const effect = this.find(record, step)
      if (effect && ['pending', 'unknown'].includes(effect.status))
        await this.effects.reconcile(record.run, effect.intent.id, this.host(record, step))
    }
    if (
      this.find(record, 'stage')?.status === 'applied' &&
      this.find(record, 'commit')?.status === 'applied'
    )
      this.publish(record)
    return this.inspect(digest)
  }
  requestCancellation(digest: string) {
    const record = this.get(digest)
    for (const step of ['stage', 'commit'] as const) {
      const effect = this.find(record, step)
      if (effect?.invocation && ['pending', 'unknown'].includes(effect.status))
        new AssemblyGitProcess(
          this.files,
          `delivery/commit-operations/${record.digest}/${effect.invocation}`,
        ).requestCancellation()
    }
  }
  inspect(digest: string) {
    const record = this.get(digest),
      stage = this.find(record, 'stage'),
      committed = this.find(record, 'commit'),
      pending = [stage, committed].some(
        (effect) => effect && ['pending', 'unknown'].includes(effect.status),
      ),
      failed = [stage, committed].some(
        (effect) => effect && ['not-applied', 'abandoned'].includes(effect.status),
      )
    let current = true,
      receipt: CandidateCommitReceipt | undefined
    try {
      const allocation = this.allocation(record)
      if (pending) current = false
      else {
        const observed = currentWorkspaceCommit(this.effects.lifecycle, allocation)
        if (observed?.record === digest) {
          this.owned(allocation)
          if (git(allocation.repository.path, ['rev-parse', 'HEAD']).trim() !== observed.head)
            throw new CandidateCommitError('published-head-changed')
          receipt = observed
        } else {
          if (committed?.status === 'applied')
            throw new CandidateCommitError('head-locator-unavailable')
          this.before(record, stage?.status === 'applied' ? 'commit' : 'stage')
        }
      }
    } catch {
      current = false
    }
    const result = {
      schema: 'wholeloop/delivery-commit-status@1' as const,
      digest,
      record,
      current,
      status: pending
        ? ('unknown' as const)
        : failed
          ? ('failed' as const)
          : !current
            ? ('stale' as const)
            : receipt
              ? ('committed' as const)
              : stage?.status === 'applied'
                ? ('staged' as const)
                : ('prepared' as const),
      ...(receipt ? { receipt } : {}),
      acceptance: 'not-established' as const,
      publication: 'not-performed' as const,
    }
    validateDeliveryShape(result, CANDIDATE_COMMIT_SCHEMAS.status)
    return result
  }
}
