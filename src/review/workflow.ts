// The review-code workflow and its receipt.
import { BuildWorkflow } from '../build/workflow.js'
import type { FlowEngine } from '../flow/engine.js'
import { gateAssignments } from '../gates/assignments.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { itemId, type StateEvent } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import { workerModels } from '../workers/models.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { git, namedBase } from '../worktrees/git.js'
import { WorktreeManager } from '../worktrees/manager.js'
import { prepareReviewInput, reviewRubric } from './input.js'
import { reviewInputs } from './state.js'

export interface ReviewOptions {
  subject?: string
  branch?: string
  pr?: string
  owner?: string
  base?: string
  rounds?: number
}

export class ReviewWorkflow {
  constructor(readonly engine: FlowEngine) {}

  begin(options: ReviewOptions) {
    const events = this.engine.store.events()
    const allocation = worktreeRecords(events).find((entry) => entry.subject === options.subject)
    const previous = gateRuns(events)
      .filter((run) => run.subject === options.subject && run.gate === 'review')
      .at(-1)
    const base = options.base ?? previous?.rounds[0]?.plan.base.ref ?? allocation?.base.ref
    const questions: { id: string; prompt: string }[] = []
    if (!options.subject && !options.owner?.trim())
      questions.push({ id: 'owner', prompt: 'Who owns this standalone review?' })
    if (!base)
      questions.push({
        id: 'base',
        prompt: 'Which named base should this branch or PR be reviewed against?',
      })
    if (options.pr) {
      const url = new URL(options.pr)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw new Error('Use a credential-free HTTPS PR reference')
      if (!options.branch)
        questions.push({
          id: 'checkout-ref',
          prompt: 'Resolve the PR head to a local named branch through the host before reviewing.',
        })
    }
    if (questions.length)
      return { schema: 'wholeloop/review-begin@1', status: 'question' as const, questions }
    if (
      options.rounds !== undefined &&
      (!Number.isInteger(options.rounds) || options.rounds < 1 || options.rounds > 10)
    )
      throw new Error('Review rounds must be between 1 and 10')
    const engine = options.subject
      ? new BuildWorkflow(this.engine).engineFor(options.subject)
      : this.engine
    if (
      options.subject &&
      !['slice', 'part', 'review'].includes(engine.store.get(options.subject).kind)
    )
      throw new Error('Review an open slice, part or standalone review')
    const branch = options.branch ?? git(engine.root, ['branch', '--show-current']).trim()
    if (!allocation) namedBase(engine.root, branch)
    namedBase(engine.root, base ?? '')
    reviewRubric(engine, allocation?.path ?? engine.root, options.subject)
    const subject =
      options.subject ??
      engine.store.transaction((_events, append) => {
        const id = itemId('review')
        append(id, {
          type: 'item.created',
          data: {
            kind: 'review',
            title: `Review ${options.pr ?? branch}`,
            owner: options.owner ?? '',
            body: 'Standalone code review; no earlier Define, build or verification step is implied.',
            repository: canonicalPath(engine.root),
          },
        })
        if (options.pr) append(id, { type: 'link.added', data: { url: options.pr } })
        return id
      })
    const start = engine.begin('review-code', { subject })
    if (start.code !== 0) throw new Error('Resolve review-code preconditions before execution')
    if (!allocation) new WorktreeManager(engine).create(subject, { base: branch })
    const current = engine.store.events()
    const started = current.findLastIndex(
      (event) =>
        event.subject === subject &&
        event.type === 'step.started' &&
        event.data.step === 'review-code',
    )
    const prior = previous?.rounds.at(-1)
    const planned = current.findIndex(
      (event) => event.type === 'gate.planned' && event.data.plan.run === prior?.plan.run,
    )
    const result = new GateWorkflow(engine).plan(subject, 'review', {
      base: base ?? '',
      ...(options.rounds !== undefined ? { rounds: options.rounds } : {}),
      ...(prior?.decision?.report.verdict === 'PASS' && planned <= started ? { newRun: true } : {}),
    })
    const review = prepareReviewInput(engine, result.plan)
    const state = gateRuns(engine.store.events())
      .find((run) => run.run === result.plan.run)
      ?.rounds.at(-1)
    return {
      ...result,
      schema: 'wholeloop/review-begin@1',
      scratch: start.payload.scratch,
      status: 'planned' as const,
      questions: [],
      subject,
      review,
      ...gateAssignments(result.plan, {
        results: state?.results ?? [],
        votes: state?.votes ?? [],
        review,
        models: workerModels(this.engine),
      }),
    }
  }

  input(subject: string) {
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const plan = gateRuns(engine.store.events())
      .filter((run) => run.subject === subject && run.gate === 'review')
      .at(-1)
      ?.rounds.at(-1)?.plan
    if (!plan) throw new Error('Plan a review round first')
    const review = prepareReviewInput(engine, plan)
    const state = gateRuns(engine.store.events())
      .find((run) => run.run === plan.run)
      ?.rounds.at(-1)
    return {
      schema: 'wholeloop/review-context@1',
      subject,
      ...review,
      ...gateAssignments(plan, {
        results: state?.results ?? [],
        votes: state?.votes ?? [],
        review,
        models: workerModels(this.engine),
      }),
    }
  }

  complete(subject: string) {
    this.input(subject)
    return this.engine.complete(
      'review-code',
      subject,
      reviewReceipt(this.engine.store.events(), subject),
    )
  }
}

export function reviewReceipt(events: readonly StateEvent[], subject: string) {
  const gate = gateRuns(events)
    .filter((run) => run.subject === subject && run.gate === 'review')
    .at(-1)
    ?.rounds.at(-1)
  const input = reviewInputs(events).find(
    (entry) =>
      entry.subject === subject &&
      entry.input.run === gate?.plan.run &&
      entry.input.round === gate?.plan.round,
  )?.input
  const started = events.findLastIndex(
    (event) =>
      event.subject === subject &&
      event.type === 'step.started' &&
      event.data.step === 'review-code',
  )
  const planned = events.findIndex(
    (event) =>
      event.type === 'gate.planned' &&
      event.data.plan.run === gate?.plan.run &&
      event.data.plan.round === gate?.plan.round,
  )
  if (
    !gate ||
    !input ||
    gate.decision?.report.verdict !== 'PASS' ||
    started < 0 ||
    planned <= started ||
    workspaceSnapshot(gate.plan.repository).digest !== gate.plan.snapshot.digest
  )
    throw new Error(
      'Review completion requires its pinned input and current review PASS after the step began',
    )
  return `# Code review receipt\n\n## Rubric\n\n${input.rubric.ref} (${input.rubric.origin}); SHA-256 ${input.rubric.digest}.\n\n## Diff\n\nRound ${input.round}; patch SHA-256 ${input.diffDigest}. ${input.before} to ${input.after}.\n\n## Findings\n\n${gate.decision.report.kept.length} kept; ${gate.decision.report.dropped.length} refuted. Full evidence: items/${subject}/gates/${input.run}/${input.round}.json.\n\n## Verdict\n\nPASS — ${input.run}; workspace ${gate.plan.snapshot.digest}. Human testing remains separate.\n`
}
