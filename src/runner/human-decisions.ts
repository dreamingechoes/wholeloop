import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { currentPersonAttribution } from '../state/attribution-context.js'
import type { RunnerStageRecord } from './events.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export type RunnerHumanDecision = 'delivery-plan' | 'approve-build-plan' | 'acceptance'
/** What a person must decide: the exact subject digest a stage published. */
export interface RunnerHumanRequest {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  decision: RunnerHumanDecision
  subject: string
  at: string
}
export interface RunnerHumanDecisionRecord {
  schema: 'wholeloop/delivery-human-decision@1'
  request: string
  plan: string
  stage: string
  invocation: string
  decision: RunnerHumanDecision
  subject: string
  outcome: 'accept' | 'reject'
  by: string
  note: string
  at: string
}
const KINDS: Readonly<Record<string, RunnerHumanDecision>> = {
  plan: 'delivery-plan',
  'build-plan': 'approve-build-plan',
  acceptance: 'acceptance',
}

/** Stages publish requests; only the operator command records a person's decision. */
export class RunnerHumanDecisions {
  constructor(
    readonly store: RunnerStore,
    readonly now: () => string = () => new Date().toISOString(),
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('human-decision-invocation')
    return `delivery/runner-human-decisions/${invocation}`
  }
  private original(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      stage = runnerRoute(basis.plan).find((entry) => entry.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((entry) => entry.id === record.id && entry.invocation === record.invocation),
      decision = stage ? KINDS[stage.kind] : undefined
    if (
      !retained ||
      retained.basis !== record.basis ||
      basis.digest !== record.basis ||
      !decision ||
      // None-policy runs never wait for or record a person.
      basis.plan.policy.intervention === 'none'
    )
      throw new DeliveryRunnerError('human-decision-unavailable')
    return { digest, decision }
  }
  open(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    subject: string,
  ): RunnerHumanRequest {
    const { digest, decision } = this.original(request, record)
    if (!/^[a-f0-9]{64}$/.test(subject)) throw new DeliveryRunnerError('human-decision-subject')
    return this.store.files.locked(() => {
      const prior = this.pending(request, record)
      if (prior) {
        if (prior.subject !== subject) throw new DeliveryRunnerError('human-decision-subject')
        return prior
      }
      const opened: RunnerHumanRequest = {
        version: 1,
        request: digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        decision,
        subject,
        at: this.now(),
      }
      this.store.files.atomic(
        `${this.path(record.invocation)}/request.json`,
        `${JSON.stringify(opened)}\n`,
      )
      return opened
    })
  }
  pending(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = `${this.path(record.invocation)}/request.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const { digest, decision } = this.original(request, record),
      value = JSON.parse(readSourceFile(this.store.files.root, path, 4096)) as RunnerHumanRequest
    if (
      Object.keys(value).sort().join(',') !==
        'at,decision,invocation,plan,request,stage,subject,version' ||
      value.version !== 1 ||
      value.request !== digest ||
      value.plan !== record.basis ||
      value.stage !== record.id ||
      value.invocation !== record.invocation ||
      value.decision !== decision ||
      !/^[a-f0-9]{64}$/.test(value.subject)
    )
      throw new DeliveryRunnerError('human-decision-request-binding')
    return value
  }
  decided(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const opened = this.pending(request, record),
      path = `${this.path(record.invocation)}/decision.json`
    if (!opened || !existsSync(this.store.files.path(path))) return undefined
    const value = JSON.parse(
      readSourceFile(this.store.files.root, path, 8192),
    ) as RunnerHumanDecisionRecord
    if (
      Object.keys(value).sort().join(',') !==
        'at,by,decision,invocation,note,outcome,plan,request,schema,stage,subject' ||
      value.schema !== 'wholeloop/delivery-human-decision@1' ||
      value.request !== opened.request ||
      value.plan !== opened.plan ||
      value.stage !== opened.stage ||
      value.invocation !== opened.invocation ||
      value.decision !== opened.decision ||
      value.subject !== opened.subject ||
      !['accept', 'reject'].includes(value.outcome) ||
      !value.by.trim() ||
      value.at < opened.at
    )
      throw new DeliveryRunnerError('human-decision-record-binding')
    return value
  }
  /** The person names the exact subject they reviewed; a changed subject records nothing. */
  record(input: {
    request: string
    stage: string
    decision: RunnerHumanDecision
    subject: string
    outcome: 'accept' | 'reject'
    by: string
    note?: string
  }): RunnerHumanDecisionRecord {
    const request = this.store.get(input.request),
      record = this.store.stage(input.request, input.stage)
    if (!record || !['prepared', 'running', 'pending'].includes(record.status))
      throw new DeliveryRunnerError('human-decision-not-requested')
    const by = input.by.trim(),
      note = input.note?.trim() ?? ''
    if (
      !by ||
      by.length > 128 ||
      note.length > 4096 ||
      !['accept', 'reject'].includes(input.outcome)
    )
      throw new DeliveryRunnerError('human-decision-input')
    safeSourceText(JSON.stringify({ by, note }), 8192)
    const metadata = currentPersonAttribution()
    const result = this.store.files.locked(() => {
      const opened = this.pending(request, record)
      if (!opened) throw new DeliveryRunnerError('human-decision-not-requested')
      if (opened.decision !== input.decision || opened.subject !== input.subject)
        throw new DeliveryRunnerError('human-decision-subject')
      const prior = this.decided(request, record)
      if (prior) {
        if (prior.outcome !== input.outcome || prior.by !== by || prior.note !== note)
          throw new DeliveryRunnerError('human-decision-already-recorded')
        return prior
      }
      const value: RunnerHumanDecisionRecord = {
        schema: 'wholeloop/delivery-human-decision@1',
        request: opened.request,
        plan: opened.plan,
        stage: opened.stage,
        invocation: opened.invocation,
        decision: opened.decision,
        subject: opened.subject,
        outcome: input.outcome,
        by,
        note,
        at: this.now(),
      }
      this.store.files.atomic(
        `${this.path(record.invocation)}/decision.json`,
        `${JSON.stringify(value)}\n`,
      )
      return value
    })
    if (metadata) {
      const journal = this.store.lifecycle.journal,
        digest = contractDigest(result),
        actor = {
          kind: 'operator' as const,
          name: result.by,
          ...(metadata.actor?.kind === 'person' && metadata.actor.channel !== undefined
            ? { channel: metadata.actor.channel }
            : {}),
        },
        payload = {
          schema: 'wholeloop/delivery-person-attribution@1' as const,
          basis: result.plan,
          record: digest,
          invocation: result.invocation,
          ...(metadata.rationale !== undefined ? { rationale: metadata.rationale } : {}),
        }
      // Publish the immutable decision first. A retry may repair only its missing description.
      journal.transaction(actor, (_states, append) => {
        const prior = journal
          .events()
          .find(
            (entry) =>
              entry.run === request.run &&
              entry.payload.schema === payload.schema &&
              entry.payload.invocation === result.invocation,
          )
        if (prior) {
          if (
            contractDigest(prior.payload) !== contractDigest(payload) ||
            contractDigest(prior.actor) !== contractDigest(actor)
          )
            throw new DeliveryRunnerError('human-attribution-already-recorded')
          return
        }
        append(request.run, payload)
      })
    }
    return result
  }
}
