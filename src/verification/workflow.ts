// The verify-works workflow: agreed criteria, suite execution and receipt.
import { buildCriteria } from '../build/contracts.js'
import { BuildWorkflow } from '../build/workflow.js'
import { type Criterion, lintCriteria } from '../definition/criteria.js'
import type { FlowEngine } from '../flow/engine.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { itemId, type StateEvent } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { git, namedBase } from '../worktrees/git.js'
import { WorktreeManager } from '../worktrees/manager.js'
import { verificationCriteria } from './contracts.js'
import { verificationRuns } from './state.js'

export interface VerifyOptions {
  subject?: string
  branch?: string
  pr?: string
  owner?: string
  by?: string
  criteria?: Criterion[]
  base?: string
  rounds?: number
}
export class VerificationWorkflow {
  constructor(readonly engine: FlowEngine) {}

  begin(options: VerifyOptions) {
    const events = this.engine.store.events()
    let recorded = options.subject ? verificationCriteria(events, options.subject) : undefined
    if (!recorded && options.subject) {
      try {
        recorded = buildCriteria(events, options.subject)
      } catch {
        /* Ask below. */
      }
    }
    if (
      recorded &&
      options.criteria &&
      JSON.stringify(recorded) !== JSON.stringify(options.criteria)
    )
      throw new Error('Recorded agreed criteria cannot be overridden by a verification invocation')
    const criteria = options.criteria ?? recorded
    const questions: { id: string; prompt: string }[] = []
    if (!criteria?.length)
      questions.push({
        id: 'criteria',
        prompt:
          'What agreed observable criteria and falsifying tests should this branch or PR satisfy?',
      })
    if (!options.subject && !options.owner?.trim())
      questions.push({ id: 'owner', prompt: 'Who owns this standalone verification?' })
    if ((!options.subject || !recorded) && !options.by?.trim())
      questions.push({ id: 'agreement', prompt: 'Who confirmed these verification criteria?' })
    const allocation = worktreeRecords(events).find((entry) => entry.subject === options.subject)
    const pinned =
      !options.base && options.subject
        ? events.findLast(
            (event) =>
              event.subject === options.subject &&
              event.type === 'gate.planned' &&
              event.data.plan.gate === 'verify',
          )
        : undefined
    // The worktree checkout base can differ from the comparison already agreed for verification.
    const base =
      options.base ??
      (pinned?.type === 'gate.planned' ? pinned.data.plan.base.ref : allocation?.base.ref)
    if (!base)
      questions.push({
        id: 'base',
        prompt: 'Which named base should the branch or PR be compared against?',
      })
    if (options.pr) {
      const url = new URL(options.pr)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw new Error('Use a credential-free HTTPS PR reference')
      if (!options.branch)
        questions.push({
          id: 'checkout-ref',
          prompt:
            'Resolve the PR head to a local named branch through the host; no remote checkout was guessed.',
        })
    }
    if (questions.length)
      return {
        schema: 'wholeloop/verify-begin@1',
        status: 'question' as const,
        questions,
        subject: options.subject ?? null,
      }
    if (!criteria || lintCriteria(criteria).length)
      throw new Error('Verification requires testable agreed criteria')
    if (!options.subject) {
      const branch = options.branch ?? git(this.engine.root, ['branch', '--show-current']).trim()
      namedBase(this.engine.root, branch)
      namedBase(this.engine.root, base ?? '')
    }
    let subject = options.subject
    if (!subject) {
      subject = this.engine.store.transaction((_events, append) => {
        const id = itemId('slice')
        append(id, {
          type: 'item.created',
          data: {
            kind: 'slice',
            title: `Verify ${options.pr ?? options.branch ?? 'current branch'}`,
            owner: options.owner ?? '',
            body: 'Standalone verification; no earlier build or Define step is implied.',
            repository: canonicalPath(this.engine.root),
          },
        })
        append(id, {
          type: 'verify.agreed',
          data: {
            criteria,
            by: options.by ?? '',
            source: options.pr ?? options.branch ?? 'current branch',
          },
        })
        return id
      })
    }
    if (options.subject && !recorded)
      this.engine.store.transaction((_events, append) =>
        append(subject ?? '', {
          type: 'verify.agreed',
          data: {
            criteria,
            by: options.by ?? '',
            source: options.pr ?? options.branch ?? subject ?? '',
          },
        }),
      )
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const start = engine.begin('verify-works', { subject })
    if (start.code !== 0) throw new Error('Resolve verify-works preconditions before execution')
    if (!allocation) {
      const branch = options.branch ?? git(engine.root, ['branch', '--show-current']).trim()
      if (!branch) throw new Error('Choose a named branch for standalone verification')
      new WorktreeManager(engine).create(subject, { base: branch })
    }
    const current = engine.store.events()
    const prior = gateRuns(current)
      .filter((run) => run.subject === subject && run.gate === 'verify')
      .at(-1)
      ?.rounds.at(-1)
    const startedIndex = current.findLastIndex(
      (event) =>
        event.subject === subject &&
        event.type === 'step.started' &&
        event.data.step === 'verify-works',
    )
    const priorIndex = current.findIndex(
      (event) => event.type === 'gate.planned' && event.data.plan.run === prior?.plan.run,
    )
    const result = new GateWorkflow(engine).plan(subject, 'verify', {
      base: base ?? '',
      criteria,
      ...(options.rounds !== undefined ? { rounds: options.rounds } : {}),
      ...(prior?.decision?.report.verdict === 'PASS' && priorIndex <= startedIndex
        ? { newRun: true }
        : {}),
    })
    return {
      ...result,
      schema: 'wholeloop/verify-begin@1',
      status: 'planned' as const,
      questions: [],
      subject,
      stepRun: start.payload.run,
    }
  }

  complete(subject: string) {
    return this.engine.complete(
      'verify-works',
      subject,
      verificationReceipt(this.engine.store.events(), subject),
    )
  }
}

export function verificationReceipt(events: readonly StateEvent[], subject: string): string {
  const gate = gateRuns(events)
    .filter((run) => run.subject === subject && run.gate === 'verify')
    .at(-1)
    ?.rounds.at(-1)
  if (
    gate?.decision?.report.verdict !== 'PASS' ||
    workspaceSnapshot(gate.plan.repository).digest !== gate.plan.snapshot.digest
  )
    throw new Error('Verification completion requires a current verify PASS')
  const suite = verificationRuns(events).find(
    (entry) => entry.run === gate.plan.run && entry.round === gate.plan.round,
  )
  if (suite?.result?.status !== 'passed')
    throw new Error('Verification completion requires its successful recorded suite execution')
  const started = events.findLastIndex(
    (event) =>
      event.subject === subject &&
      event.type === 'step.started' &&
      event.data.step === 'verify-works',
  )
  if (
    started < 0 ||
    events.findIndex(
      (event) =>
        event.type === 'gate.planned' &&
        event.data.plan.run === gate.plan.run &&
        event.data.plan.round === gate.plan.round,
    ) <= started
  )
    throw new Error('Begin verification before its gate round')
  return `# Verification receipt\n\n## Criteria\n\n${gate.plan.units
    .filter((unit) => unit.lens === 'acceptance')
    .map((unit) => unit.asks)
    .join(
      '\n',
    )}\n\n## Suite\n\n${suite.result.commands.map((command) => `- ${command.ref}: exit ${command.exitCode}; stdout SHA-256 ${command.stdout}; stderr SHA-256 ${command.stderr}`).join('\n')}\n\n## Testability\n\nChanged tests receive read-only semantic examination; constant-assertion lint does not prove mutation sensitivity.\n\n## Verdict\n\nPASS — ${gate.plan.run}, round ${gate.plan.round}; workspace ${gate.plan.snapshot.digest}. Human testing remains separate.\n`
}
