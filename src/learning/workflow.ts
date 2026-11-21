// The decide-next workflow: plan, challenge and the recorded decision.
import { randomBytes } from 'node:crypto'
import { BuildWorkflow } from '../build/workflow.js'
import type { FlowEngine } from '../flow/engine.js'
import { impactRuns } from '../impact/contracts.js'
import { impactReport } from '../impact/report.js'
import { configuredCheckpoints } from '../impact/schedule.js'
import { measurementDigest } from '../launch/measurement.js'
import type { Profile } from '../profile/presets.js'
import { renderProfile } from '../profile/render.js'
import { itemId, replay } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import {
  type IterationIdea,
  type LearningChallenge,
  type LearningOutcome,
  learningFollowups,
  learningReceipt,
  learningRuns,
  validLearningData,
} from './contracts.js'
import { learningEvidence, type ReportedLearning } from './evidence.js'
import { learningGuidance } from './guidance.js'

const latest = (engine: FlowEngine, subject: string) =>
  learningRuns(engine.store.events())
    .filter((run) => run.subject === subject)
    .at(-1)
function frameDraft(idea: IterationIdea, owner: string, evidence: string, reason: string) {
  return `# ${idea.title}\n\n## Problem\n\n${idea.problem}\n\n## Who it is for\n\n${idea.audience}\n\n## Evidence and hypothesis\n\nLearning evidence: ${evidence}. Iteration reason: ${reason}. This is a proposed hypothesis, not new validation.\n\n## Expected impact\n\n${idea.impact}\n\n## Who validated it\n\nTBD: validate the revised hypothesis; who: ${owner}\n\n## Cost and priority\n\nTBD: agree effort and priority; who: ${owner}\n\n## Stop conditions\n\nTBD: agree conditions that would stop the iteration; who: ${owner}\n\n## Scope hint\n\nProposed follow-up only; define scope after framing.\n\n## Owner\n\n${owner}\n`
}
export class LearningWorkflow {
  constructor(readonly engine: FlowEngine) {}
  begin(options: {
    subject?: string
    input?: string
    owner?: string
    leaning?: LearningOutcome
    reported?: ReportedLearning
  }) {
    const engine = options.subject
      ? new BuildWorkflow(this.engine).engineFor(options.subject)
      : this.engine
    const item = options.subject ? engine.store.get(options.subject) : undefined
    if (item && (item.kind !== 'scope' || item.status !== 'open'))
      throw new Error('Decide an open scope or an explicitly owned standalone outcome')
    const owner = options.owner ?? item?.owner
    const previous = item ? latest(engine, item.id) : undefined
    const leaning = options.leaning ?? previous?.plan.leaning
    const checkpoints = configuredCheckpoints(engine.config())
    const evidence = learningEvidence(
      engine.store.events(),
      item?.id ?? '',
      checkpoints,
      options.reported ?? previous?.plan.evidence.reported,
    )
    const questions: { id: string; prompt: string }[] = []
    if (!owner?.trim())
      questions.push({ id: 'owner', prompt: 'Who owns the outcome and follow-up?' })
    if (!item && !options.input?.trim())
      questions.push({ id: 'input', prompt: 'What shipped outcome are you deciding?' })
    if (!leaning)
      questions.push({
        id: 'leaning',
        prompt: 'Which option are you leaning toward: keep, iterate, kill or unflag?',
      })
    if (!evidence)
      questions.push({
        id: 'evidence',
        prompt:
          'Run measure-impact first, or explicitly report the promise, observations, references and person without claiming measured results.',
      })
    if (questions.length)
      return { schema: 'wholeloop/learning-begin@1', status: 'question' as const, questions }
    if (!leaning || !evidence) throw new Error('Missing decision context')
    const guidance = learningGuidance(engine, options.subject)
    const { content: _content, ...reference } = guidance
    const profile = engine.config().profile as unknown as Profile
    const candidate = {
      run: 'run-0000000000000000',
      leaning,
      evidence,
      checkpoints,
      profile: { challenge: profile.challenge, instructions: renderProfile(profile) },
      guidance: reference,
    }
    if (!validLearningData('learn.planned', candidate))
      throw new Error('Invalid learning decision plan')
    const subject =
      item?.id ??
      engine.store.create({
        kind: 'scope',
        title: options.input ?? '',
        owner: owner ?? '',
        body: 'Standalone outcome decision based on explicitly labelled evidence; no prior shipping or measurement history is implied.',
        repository: canonicalPath(engine.root),
      }).id
    const begun = engine.begin('decide-next', { subject })
    if (begun.code !== 0 || !begun.payload.run) throw new Error('Resolve decide-next preconditions')
    const plan = { ...candidate, run: begun.payload.run }
    engine.store.transaction((events, append) => {
      const current = learningRuns(events)
        .filter((run) => run.subject === subject)
        .at(-1)
      if (
        current?.plan.run !== plan.run ||
        measurementDigest(current.plan) !== measurementDigest(plan)
      )
        append(subject, { type: 'learn.planned', data: plan })
    })
    return {
      schema: 'wholeloop/learning-begin@1',
      scratch: begun.payload.scratch,
      status: 'planned' as const,
      subject,
      context: this.context(subject),
      questions: [],
    }
  }
  context(subject: string) {
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const record = latest(engine, subject)
    if (!record) throw new Error('Begin decide-next before challenging or recording a decision')
    const guidance = learningGuidance(engine, subject, record.plan.run)
    const { content: _content, ...reference } = guidance
    const profile = engine.config().profile as unknown as Profile
    if (
      measurementDigest(reference) !== measurementDigest(record.plan.guidance) ||
      renderProfile(profile) !== record.plan.profile.instructions
    )
      throw new Error(
        'Restore pinned decision guidance/profile or explicitly re-plan before deciding',
      )
    const evidence = learningEvidence(
      engine.store.events(),
      subject,
      record.plan.checkpoints,
      record.plan.evidence.reported,
    )
    if (measurementDigest(evidence) !== measurementDigest(record.plan.evidence))
      throw new Error('Learning evidence changed; re-plan and challenge the current report')
    const impact = impactRuns(engine.store.events())
      .filter((run) => run.subject === subject && run.observation)
      .at(-1)
    return {
      engine,
      record,
      guidance,
      report: impact ? impactReport(impact) : null,
      challenge: {
        against: record.plan.leaning,
        alternatives: ['keep', 'iterate', 'kill', 'unflag'].filter(
          (outcome) => outcome !== record.plan.leaning,
        ),
        coverage: [
          'Original promise versus evidence',
          'Strongest case against the leaning',
          'Unknowns and pending checkpoints',
          'Reversibility, exposure and cleanup cost',
        ],
        style: record.plan.profile.instructions,
        additionalQuestions: { supportive: 1, balanced: 2, adversarial: 3 }[
          record.plan.profile.challenge
        ],
      },
    }
  }
  challenge(subject: string, challenge: LearningChallenge) {
    const { engine, record } = this.context(subject)
    engine.store.transaction((_events, append) =>
      append(subject, { type: 'learn.challenged', data: { run: record.plan.run, challenge } }),
    )
    return this.report(subject)
  }
  decide(
    subject: string,
    options: {
      outcome: LearningOutcome
      basis: string
      by: string
      reason: string
      acknowledgedUnknowns: string[]
      iteration?: IterationIdea
    },
  ) {
    const { engine, record } = this.context(subject)
    if (record.decision) {
      const prior = record.decision.value
      const ideaKey = (idea: IterationIdea | undefined) =>
        JSON.stringify(
          idea
            ? [idea.title, idea.problem, idea.audience, idea.impact, idea.existing ?? null]
            : null,
        )
      if (
        prior.outcome !== options.outcome ||
        prior.basis !== options.basis ||
        prior.by !== options.by ||
        prior.reason !== options.reason ||
        JSON.stringify([...prior.acknowledgedUnknowns].sort()) !==
          JSON.stringify([...options.acknowledgedUnknowns].sort()) ||
        ideaKey(prior.iteration) !== ideaKey(options.iteration)
      )
        throw new Error(
          'A recorded decision is immutable; inspect its receipt instead of changing it',
        )
      const receipt = this.complete(subject)
      return { report: this.report(subject), receipt, cached: true }
    }
    if (engine.store.get(subject).status !== 'open')
      throw new Error('Reopen the scope explicitly before making a new decision')
    if (options.outcome === 'unflag' && !record.plan.evidence.flag)
      throw new Error('Confirm the flag identifier before choosing unflag')
    if (!record.challenge)
      throw new Error('Read and record a counterargument before the human decision')
    const idea = options.iteration
    if (idea?.existing) {
      const existing = engine.store.get(idea.existing)
      const events = engine.store.events()
      if (
        existing.kind !== 'initiative' ||
        existing.status !== 'closed' ||
        !existing.repository ||
        canonicalPath(existing.repository) !== canonicalPath(engine.root) ||
        existing.id === engine.store.get(subject).parent ||
        events.some(
          (event) => event.type === 'item.created' && event.data.parent === existing.id,
        ) ||
        events.some(
          (event) =>
            event.subject === existing.id &&
            event.type === 'step.completed' &&
            !['research', 'frame-problem'].includes(event.data.step),
        )
      )
        throw new Error(
          'Reopen only an explicitly selected closed pre-spec idea in this repository; otherwise create a new linked idea',
        )
    }
    const scopeOwner = engine.store.get(subject).owner
    const repository = canonicalPath(engine.root)
    engine.store.transaction((events, append) => {
      const items = replay(events)
      const current = learningRuns(events)
        .filter((run) => run.subject === subject)
        .at(-1)
      if (
        current?.event !== record.event ||
        current.challenge?.event !== record.challenge?.event ||
        current.decision
      )
        throw new Error('The challenged decision changed before submission')
      let id = idea?.existing ?? itemId('initiative')
      while (!idea?.existing && items.has(id)) id = itemId('initiative')
      const { iteration: _iteration, ...call } = options
      append(subject, {
        type: 'learn.decided',
        data: { run: record.plan.run, ...call, ...(idea ? { iteration: { ...idea, id } } : {}) },
      })
      const decision = events.at(-1)?.id ?? ''
      if (idea) {
        const iterationOwner = idea.existing
          ? (items.get(idea.existing)?.owner ?? scopeOwner)
          : scopeOwner
        const body = frameDraft(idea, iterationOwner, record.plan.evidence.ref, options.reason)
        if (idea.existing)
          append(id, { type: 'item.updated', data: { status: 'open', body, title: idea.title } })
        else
          append(id, {
            type: 'item.created',
            data: { kind: 'initiative', title: idea.title, owner: scopeOwner, body, repository },
          })
        const run = `run-${randomBytes(8).toString('hex')}`
        append(id, {
          type: 'step.started',
          data: { step: 'frame-problem', run, mode: 'standalone', input: idea.title },
        })
        append(id, { type: 'link.added', data: { url: record.plan.evidence.ref } })
        append(subject, {
          type: 'learn.iteration-linked',
          data: { run: record.plan.run, idea: id, decision },
        })
      }
    })
    const receipt = this.complete(subject)
    return { report: this.report(subject), receipt, cached: false }
  }
  complete(subject: string) {
    const { engine, record } = this.context(subject)
    if (record.complete)
      return {
        artifact: `items/${subject}/artifacts/decide-next/${record.plan.run}.md`,
        cached: true,
      }
    return engine.complete('decide-next', subject, learningReceipt(engine.store.events(), subject))
  }
  report(subject: string) {
    const { record, guidance, report } = this.context(subject)
    return {
      schema: 'wholeloop/learning-report@1',
      subject,
      run: record.plan.run,
      planEvent: record.event,
      plan: record.plan,
      challenge: record.challenge ?? null,
      decision: record.decision ?? null,
      iteration: record.iteration ?? null,
      complete: record.complete ?? false,
      followups: learningFollowups(record),
      guidance,
      impact: report,
    }
  }
}
