// Private store and contracts for delegated machine decisions, written only by a trusted controller
// host.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryBudgets } from '../delivery/budgets.js'
import { readSourceBytes, readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DeliveryBasis, DeliveryPlan } from '../delivery/plan.js'
import {
  checkPlanEnvelope,
  deliveryPlanRoute,
  observePlanBases,
  validateDeliveryShape,
} from '../delivery/plan.js'
import {
  type DecisionId,
  type DecisionOutcome,
  type DecisionRubric,
  type DecisionUnknown,
  DelegatedDecisionError,
  decisionPolicyDigest,
  decisionRubric,
  uniqueDecisionValues,
} from './policy.js'
import inspectionSchema from './schemas/inspection-v1.json' with { type: 'json' }
import pinsSchema from './schemas/pins-v1.json' with { type: 'json' }
import preflightSchema from './schemas/preflight-v1.json' with { type: 'json' }
import recordSchema from './schemas/record-v1.json' with { type: 'json' }
import requestSchema from './schemas/request-v1.json' with { type: 'json' }

export const DECISION_SCHEMAS = {
  request: requestSchema,
  record: recordSchema,
  inspection: inspectionSchema,
  pins: pinsSchema,
  preflight: preflightSchema,
}
interface DecisionFile {
  ref: string
  sha256: string
}
export interface DecisionRequest {
  schema: 'wholeloop/delegated-decision-request@1'
  key: string
  grant: string
  run: string
  revision: number
  plan: string
  decision: DecisionId
  artifacts: DecisionFile[]
  evidence: (DecisionFile & { id: string })[]
  unknowns: DecisionUnknown[]
}
export interface DecisionIdentity {
  assignment: string
  worker: string
  invocation: string
  role: 'planner' | 'challenger'
  runtime: string
  state: 'completed'
  provenance: 'fixture' | 'host-observed'
}
export interface DecisionJudgment {
  identity: DecisionIdentity
  basis: string
  outcome: DecisionOutcome
  rationale: string
  uncertainties: DecisionUnknown[]
}
export interface DecisionChallenge {
  identity: DecisionIdentity
  basis: string
  judgment: string
  verdict: 'supported' | 'rejected' | 'unknown'
  rationale: string
  uncertainties: DecisionUnknown[]
}
export interface DecisionObservation extends DecisionFile {
  id: string
  status: 'passed' | 'failed' | 'unknown' | 'human-required'
  observation: string
  provenance: 'fixture' | 'host-observed'
}
/** Only a trusted controller host observes execution and evidence. No CLI imports these results. */
export interface DelegatedDecisionHost {
  observeEvidence(request: Readonly<DecisionRequest>): DecisionObservation[]
  prerequisites(request: Readonly<DecisionRequest>): {
    supported: boolean
    humanRequired: boolean
    interactive: 'disabled' | 'permitted' | 'unverified'
  }
  judge(context: DecisionHostContext): Promise<DecisionJudgment>
  challenge(
    context: DecisionHostContext,
    judgment: Readonly<DecisionJudgment>,
  ): Promise<DecisionChallenge>
  current(identity: Readonly<DecisionIdentity>, basis: string): boolean
}
export interface DecisionHostContext {
  request: Readonly<DecisionRequest>
  rubric: Readonly<DecisionRubric>
  basis: string
  plan: Readonly<DeliveryPlan>
  authorization: Readonly<DeliveryBasis>
  source: Readonly<
    ReturnType<
      DelegatedDecisions['budgets']['lifecycle']['authority']['planning']['sources']['get']
    >
  >
  inputs: {
    artifacts: (DecisionFile & { text: string })[]
    evidence: (DecisionFile & { id: string; text: string })[]
  }
  deadline: string
  signal: AbortSignal
}
export interface DelegatedDecision {
  schema: 'wholeloop/delegated-decision@1'
  request: DecisionRequest
  grantDigest: string
  policyDigest: string
  rubric: DecisionFile
  basis: string
  actorKind: 'machine'
  judgment: DecisionJudgment
  challenge: DecisionChallenge
  observations: DecisionObservation[]
  status: 'recorded' | 'blocked' | 'fixture-only'
  reason: string
  at: string
  gates: 'unchanged'
  humanApproval: 'not-recorded'
  effects: 'not-granted'
}
interface Pins {
  schema: 'wholeloop/delegated-decision-pins@1'
  grant: string
  grantDigest: string
  policyDigest: string
  rubrics: { decision: DecisionId; original: DecisionFile; pinned: DecisionFile }[]
  authority: 'original-grant-only'
}
/** Delegation is a separate control record; no legacy owner approval or gate result is synthesized. */
export class DelegatedDecisions {
  readonly budgets: DeliveryBudgets
  constructor(
    store?: string,
    readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.budgets = new DeliveryBudgets(store, now)
  }
  private get files() {
    return this.budgets.lifecycle.journal.files
  }
  private get authority() {
    return this.budgets.lifecycle.authority
  }
  private get planning() {
    return this.authority.planning
  }

  pin(grantId: string): Pins {
    const authority = this.authority.inspect(grantId)
    if (authority.status !== 'active') throw new DelegatedDecisionError('inactive-grant')
    const grant = authority.grant
    const basis = this.authority.basis(grant.basis)
    if (contractDigest(basis.policy) !== contractDigest(grant.policy))
      throw new DelegatedDecisionError('policy-binding')
    const pins: Pins = {
      schema: 'wholeloop/delegated-decision-pins@1',
      grant: grantId,
      grantDigest: authority.digest,
      policyDigest: decisionPolicyDigest(grant.policy),
      rubrics: grant.decisions.map((id) => {
        const delegation = grant.policy.delegations.find((d) => d.id === id)
        if (!delegation) throw new DelegatedDecisionError('undeclared-decision')
        const bytes = this.bytes(delegation.rubric)
        decisionRubric(JSON.parse(bytes.toString('utf8')), delegation.id)
        return {
          decision: delegation.id,
          original: delegation.rubric,
          pinned: {
            ref: `delivery/decision-rubrics/${delegation.rubric.sha256}.json`,
            sha256: delegation.rubric.sha256,
          },
        }
      }),
      authority: 'original-grant-only',
    }
    validateDeliveryShape(pins, pinsSchema)
    return this.files.locked(() => {
      for (const item of pins.rubrics) {
        const bytes = this.bytes(item.original)
        if (existsSync(this.files.path(item.pinned.ref))) this.bytes(item.pinned)
        else this.files.atomic(item.pinned.ref, bytes)
      }
      const path = `delivery/decision-pins/${authority.digest}.json`
      if (existsSync(this.files.path(path))) {
        if (contractDigest(this.read(path)) !== contractDigest(pins))
          throw new DelegatedDecisionError('changed-pins')
      } else this.files.atomic(path, `${JSON.stringify(pins)}\n`)
      return structuredClone(pins)
    })
  }

  preflight(input: { run: string; revision: number; grant: string }) {
    const prepared = this.planning.getPlan(input.run, input.revision),
      plan = prepared.plan,
      authority = this.authority.inspect(input.grant),
      grant = authority.grant,
      problems: string[] = []
    if (authority.status !== 'active') problems.push('inactive-grant')
    try {
      this.bindPlan(plan, prepared.digest, input.grant)
    } catch {
      problems.push('grant-plan-binding')
    }
    if (plan.policy.intervention === 'none') {
      if (plan.criteria.some((c) => c.acceptance === 'human'))
        problems.push('human-only-acceptance')
      const required: DecisionId[] =
        plan.policy.endpoint === 'research-report'
          ? ['research-plan', 'research-sources']
          : plan.policy.endpoint === 'learning-observation'
            ? ['learning-outcome']
            : [
                'approve-build-plan',
                'acceptance',
                ...(!plan.definition.ready
                  ? (['frame-outcome', 'approve-spec', 'approve-scopes'] as const)
                  : []),
              ]
      if (grant.basis.kind === 'envelope') required.push('delivery-plan')
      for (const id of required)
        if (!grant.decisions.includes(id)) problems.push(`undelegated:${id}`)
    }
    try {
      const pins = this.read(`delivery/decision-pins/${authority.digest}.json`) as unknown as Pins
      validateDeliveryShape(pins, pinsSchema)
      if (
        pins.grantDigest !== authority.digest ||
        pins.grant !== input.grant ||
        pins.policyDigest !== decisionPolicyDigest(plan.policy)
      )
        throw new DelegatedDecisionError('pin-binding')
      for (const id of grant.decisions) {
        const pin = pins.rubrics.find((p) => p.decision === id),
          declaration = grant.policy.delegations.find((d) => d.id === id)
        if (
          !pin ||
          !declaration ||
          contractDigest(pin.original) !== contractDigest(declaration.rubric)
        )
          throw new DelegatedDecisionError('pin-binding')
        this.bytes(pin.original)
        decisionRubric(JSON.parse(this.bytes(pin.pinned).toString('utf8')), declaration.id)
      }
    } catch {
      problems.push('unpinned-or-changed-rubrics')
    }
    if (deliveryPlanRoute(plan).next === 'blocked') problems.push(deliveryPlanRoute(plan).reason)
    const receipt = {
      schema: 'wholeloop/delegated-decision-preflight@1',
      run: plan.run,
      revision: plan.revision,
      plan: prepared.digest,
      grantDigest: authority.digest,
      intervention: plan.policy.intervention,
      status: problems.length
        ? plan.policy.intervention === 'none'
          ? 'blocked'
          : 'needs-input'
        : 'ready',
      problems: [...new Set(problems)],
      interactive: plan.policy.intervention === 'none' ? 'disabled' : 'permitted',
      gates: 'mandatory',
      scope: 'policy-only',
      runtime: 'not-observed',
      effects: 'original-grant-only',
    }
    validateDeliveryShape(receipt, preflightSchema)
    return receipt
  }

  private bindPlan(plan: DeliveryPlan, digest: string, grantId: string) {
    const authority = this.authority.inspect(grantId),
      grant = authority.grant
    if (authority.status !== 'active') throw new DelegatedDecisionError('inactive-grant')
    if (grant.basis.kind === 'envelope') {
      if (plan.envelope !== grant.basis.digest) throw new DelegatedDecisionError('grant-envelope')
      checkPlanEnvelope(plan, this.planning.getEnvelope(grant.basis.digest).envelope)
    } else if (
      grant.basis.digest !== digest ||
      grant.basis.run !== plan.run ||
      grant.basis.revision !== plan.revision
    )
      throw new DelegatedDecisionError('grant-plan')
    if (contractDigest(plan.policy) !== contractDigest(grant.policy))
      throw new DelegatedDecisionError('policy-binding')
    observePlanBases(plan.repositories)
    return authority
  }

  private context(request: DecisionRequest, observing = false) {
    validateDeliveryShape(request, requestSchema)
    if (
      !uniqueDecisionValues(request.artifacts.map((a) => a.ref)) ||
      !uniqueDecisionValues(request.evidence.map((e) => e.id)) ||
      !uniqueDecisionValues(request.evidence.map((e) => e.ref)) ||
      !uniqueDecisionValues(request.unknowns.map((u) => u.id))
    )
      throw new DelegatedDecisionError('duplicate-input')
    const prepared = this.planning.getPlan(request.run, request.revision)
    if (prepared.digest !== request.plan) throw new DelegatedDecisionError('plan-digest')
    const authority = this.bindPlan(prepared.plan, prepared.digest, request.grant),
      grant = authority.grant,
      declaration = grant.policy.delegations.find((d) => d.id === request.decision)
    if (!grant.decisions.includes(request.decision) || !declaration)
      throw new DelegatedDecisionError('undelegated-decision')
    const pins = this.read(`delivery/decision-pins/${authority.digest}.json`) as unknown as Pins
    validateDeliveryShape(pins, pinsSchema)
    const pin = pins.rubrics.find((p) => p.decision === request.decision)
    if (
      !pin ||
      pins.grantDigest !== authority.digest ||
      pins.policyDigest !== decisionPolicyDigest(grant.policy) ||
      contractDigest(pin.original) !== contractDigest(declaration.rubric)
    )
      throw new DelegatedDecisionError('unpinned-rubric')
    this.bytes(pin.original)
    const rubric = decisionRubric(
      JSON.parse(this.bytes(pin.pinned).toString('utf8')),
      request.decision,
    )
    let inputBytes = 0
    for (const input of [...request.artifacts, ...request.evidence])
      inputBytes += this.bytes(input).length
    if (inputBytes > 1024 * 1024) throw new DelegatedDecisionError('decision-input-limit')
    if (declaration.evidence.some((id) => !request.evidence.some((e) => e.id === id)))
      throw new DelegatedDecisionError('missing-required-evidence')
    const lifecycle = this.budgets.lifecycle.journal.get(request.run)
    if (
      lifecycle.basis.digest !== prepared.digest ||
      lifecycle.grant?.id !== request.grant ||
      lifecycle.grant.digest !== authority.digest ||
      (!observing && !['planned', 'queued', 'running'].includes(lifecycle.state))
    )
      throw new DelegatedDecisionError('inactive-run-basis')
    const basis = contractDigest({
      request,
      grant: authority.digest,
      policy: pins.policyDigest,
      rubric: pin.pinned,
    })
    return { authority, plan: prepared.plan, rubric, pin: pin.pinned, basis, lifecycle }
  }

  async decide(value: unknown, host: DelegatedDecisionHost, signal?: AbortSignal) {
    validateDeliveryShape(value, requestSchema)
    const request = structuredClone(value) as DecisionRequest,
      initial = this.context(request),
      key = `delivery/decision-keys/${request.run}/${request.key}.json`,
      requestDigest = contractDigest(request)
    const prior = this.files.read(key)
    if (prior) {
      const indexed = JSON.parse(prior) as { request: string; digest?: string }
      if (indexed.request !== requestDigest)
        throw new DelegatedDecisionError('decision-key-conflict')
      const head = JSON.parse(
        this.files.read(
          `delivery/decision-heads/${request.run}/${request.plan}/${request.decision}.json`,
        ) ?? '{}',
      ) as { digest?: string }
      const digest = indexed.digest ?? head.digest
      if (!digest) throw new DelegatedDecisionError('unknown-prior-decision')
      const retained = this.inspect(digest)
      if (contractDigest(retained.record.request) !== requestDigest)
        throw new DelegatedDecisionError('unknown-prior-decision')
      // Only a previously published immutable observation can repair its own missing locators.
      // An orphan result or a newer head never supplies completion or restores an old approval.
      this.files.locked(() => {
        const current = this.inspect(digest)
        const value = `${JSON.stringify({ request: requestDigest, digest })}\n`
        if (this.files.read(key) !== value) this.files.atomic(key, value)
        if (request.decision === 'delivery-plan' && current.status !== 'stale') {
          const path = `delivery/accepted-plans/${current.record.grantDigest}/${request.plan}.json`,
            body = `${JSON.stringify({ digest })}\n`
          if (this.files.read(path) !== body) this.files.atomic(path, body)
        }
      })
      return this.inspect(digest)
    }
    const prerequisites = host.prerequisites(structuredClone(request))
    if (
      !prerequisites.supported ||
      prerequisites.humanRequired ||
      (initial.plan.policy.intervention === 'none' && prerequisites.interactive !== 'disabled') ||
      (initial.plan.policy.intervention === 'none' &&
        initial.plan.criteria.some((c) => c.acceptance === 'human'))
    )
      throw new DelegatedDecisionError('non-delegable-or-unavailable-prerequisite')
    this.budgets.start(request.run)
    const budget = this.budgets.tick(request.run)
    if (budget.problem) throw new DelegatedDecisionError('budget-unavailable')
    if (
      budget.requirements.tokens?.mode === 'hard' ||
      budget.requirements.currency?.mode === 'hard'
    )
      throw new DelegatedDecisionError('unsupported-hard-decision-metering')
    const timeoutMs = Math.min(
      initial.rubric.timeoutMs,
      initial.plan.budgets.attemptMs,
      Math.max(0, Date.parse(initial.authority.grant.expiresAt) - Date.parse(this.now())),
      budget.remainingMs ?? 0,
    )
    if (timeoutMs <= 0) throw new DelegatedDecisionError('finite-decision-deadline')
    this.files.locked(() => {
      if (this.files.read(key)) throw new DelegatedDecisionError('decision-already-claimed')
      this.context(request)
      this.files.atomic(
        key,
        `${JSON.stringify({ request: requestDigest, basis: initial.basis })}\n`,
      )
      // A new judgment fences an old acceptance immediately, including crash/unknown outcomes.
      this.files.atomic(
        `delivery/decision-heads/${request.run}/${request.plan}/${request.decision}.json`,
        `${JSON.stringify({ pending: requestDigest })}\n`,
      )
    })
    const deadline = new Date(Date.parse(this.now()) + timeoutMs).toISOString(),
      abort = new AbortController(),
      relay = () => abort.abort(),
      timer = setTimeout(relay, timeoutMs)
    signal?.addEventListener('abort', relay, { once: true })
    if (signal?.aborted) relay()
    // A deadline fences late results even if a host ignores cancellation; it never supplies completion.
    let rejectDeadline: (error: Error) => void = () => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject
    })
    const fail = () => rejectDeadline(new DelegatedDecisionError('decision-interrupted'))
    abort.signal.addEventListener('abort', fail, { once: true })
    try {
      const context: DecisionHostContext = {
        request: structuredClone(request),
        rubric: structuredClone(initial.rubric),
        basis: initial.basis,
        plan: structuredClone(initial.plan),
        authorization: structuredClone(this.authority.basis(initial.authority.grant.basis)),
        source: structuredClone(this.planning.sources.get(initial.plan.source)),
        inputs: {
          artifacts: request.artifacts.map((file) => ({
            ...file,
            text: this.bytes(file).toString('utf8'),
          })),
          evidence: request.evidence.map((file) => ({
            ...file,
            text: this.bytes(file).toString('utf8'),
          })),
        },
        deadline,
        signal: abort.signal,
      }
      if (abort.signal.aborted) throw new DelegatedDecisionError('decision-interrupted')
      const observations = structuredClone(host.observeEvidence(structuredClone(request)))
      const judgment = structuredClone(await Promise.race([host.judge(context), cancelled]))
      this.currentIntent(request, requestDigest)
      const challenge = structuredClone(
        await Promise.race([host.challenge(context, structuredClone(judgment)), cancelled]),
      )
      if (abort.signal.aborted) throw new DelegatedDecisionError('decision-interrupted')
      this.currentIntent(request, requestDigest)
      const current = this.context(request)
      if (
        current.basis !== initial.basis ||
        !host.current(judgment.identity, initial.basis) ||
        !host.current(challenge.identity, initial.basis)
      )
        throw new DelegatedDecisionError('stale-host-or-basis')
      if (Date.parse(this.now()) >= Date.parse(deadline))
        throw new DelegatedDecisionError('decision-late')
      if (
        contractDigest(host.observeEvidence(structuredClone(request))) !==
        contractDigest(observations)
      )
        throw new DelegatedDecisionError('changed-evidence-observation')
      const record: DelegatedDecision = {
        schema: 'wholeloop/delegated-decision@1',
        request,
        grantDigest: initial.authority.digest,
        policyDigest: decisionPolicyDigest(initial.plan.policy),
        rubric: initial.pin,
        basis: initial.basis,
        actorKind: 'machine',
        judgment,
        challenge,
        observations,
        status: 'recorded',
        reason: 'independently-supported',
        at: this.now(),
        gates: 'unchanged',
        humanApproval: 'not-recorded',
        effects: 'not-granted',
      }
      this.validateObservations(record, initial.rubric)
      const unknowns = [...request.unknowns, ...judgment.uncertainties, ...challenge.uncertainties],
        delegation = initial.plan.policy.delegations.find((d) => d.id === request.decision),
        declining = ['reject', 'on-hold', 'dropped'].includes(judgment.outcome),
        allowedUnknownPolicy =
          delegation?.fallback === 'complete-with-unknowns' ||
          (delegation?.fallback === 'on-hold' && judgment.outcome === 'on-hold') ||
          (delegation?.fallback === 'explicit-default' &&
            unknowns.length > 0 &&
            unknowns.every((u) => initial.rubric.unknowns.defaults.some((d) => d.id === u.id))),
        blocked =
          challenge.verdict !== 'supported' ||
          observations.some(
            (e) =>
              e.status === 'human-required' ||
              (e.status === 'failed' && !declining) ||
              (e.status === 'unknown' &&
                (!allowedUnknownPolicy || !unknowns.some((u) => u.id === e.id))),
          ) ||
          unknowns.some((u) => !initial.rubric.unknowns.allowed.includes(u.id)) ||
          (unknowns.length > 0 && !declining && !allowedUnknownPolicy)
      const fixture = [judgment.identity, challenge.identity, ...observations].some(
        (o) => o.provenance === 'fixture',
      )
      record.status = blocked ? 'blocked' : fixture ? 'fixture-only' : 'recorded'
      record.reason = blocked
        ? 'unsupported-challenge-evidence-or-unknowns'
        : fixture
          ? 'fixture-is-not-native-authority'
          : 'independently-supported'
      validateDeliveryShape(record, recordSchema)
      safeSourceText(JSON.stringify(record), 1024 * 1024)
      const digest = contractDigest(record)
      if (!this.budgets.captureArtifact(request.run, Buffer.from(JSON.stringify(record))).stored)
        throw new DelegatedDecisionError('decision-artifact-unavailable')
      if (this.budgets.tick(request.run).problem)
        throw new DelegatedDecisionError('budget-unavailable')
      this.files.locked(() => {
        this.context(request)
        this.currentIntent(request, requestDigest)
        const bytes = `${JSON.stringify(record)}\n`,
          path = `delivery/decisions/${digest}.json`
        if (!existsSync(this.files.path(path))) this.files.atomic(path, bytes)
        this.files.atomic(
          `delivery/decision-heads/${request.run}/${request.plan}/${request.decision}.json`,
          `${JSON.stringify({ digest })}\n`,
        )
        this.files.atomic(key, `${JSON.stringify({ request: requestDigest, digest })}\n`)
        if (request.decision === 'delivery-plan')
          this.files.atomic(
            `delivery/accepted-plans/${record.grantDigest}/${request.plan}.json`,
            `${JSON.stringify({ digest })}\n`,
          )
      })
      return this.inspect(digest)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', relay)
      abort.signal.removeEventListener('abort', fail)
      abort.abort()
    }
  }

  inspect(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new DelegatedDecisionError('invalid-decision-id')
    const record = this.read(`delivery/decisions/${digest}.json`) as unknown as DelegatedDecision
    validateDeliveryShape(record, recordSchema)
    if (contractDigest(record) !== digest) throw new DelegatedDecisionError('damaged-decision')
    const problems: string[] = []
    const latest = this.files.read(
      `delivery/decision-heads/${record.request.run}/${record.request.plan}/${record.request.decision}.json`,
    )
    if (!latest || JSON.parse(latest).digest !== digest)
      problems.push('superseded-or-unpublished-decision')
    try {
      const context = this.context(record.request, true)
      if (
        context.basis !== record.basis ||
        context.authority.digest !== record.grantDigest ||
        decisionPolicyDigest(context.plan.policy) !== record.policyDigest
      )
        problems.push('changed-basis')
      this.validateObservations(record, context.rubric)
    } catch {
      problems.push('inactive-or-changed-basis')
    }
    const result = {
      schema: 'wholeloop/delegated-decision-status@1',
      digest,
      status: problems.length ? 'stale' : record.status === 'recorded' ? 'current' : record.status,
      problems,
      record,
    }
    validateDeliveryShape(result, inspectionSchema)
    return result
  }

  planAccepted(grantDigest: string, plan: string): boolean {
    try {
      // The private index is merely a locator; every record and current original basis is rechecked.
      const candidates = this.files.read(`delivery/accepted-plans/${grantDigest}/${plan}.json`)
      if (!candidates) return false
      const result = this.inspect(JSON.parse(candidates).digest)
      return (
        result.status === 'current' &&
        result.record.request.decision === 'delivery-plan' &&
        result.record.request.plan === plan &&
        result.record.grantDigest === grantDigest &&
        result.record.judgment.outcome === 'accept'
      )
    } catch {
      return false
    }
  }

  private currentIntent(request: DecisionRequest, digest: string): void {
    const head = this.read(
      `delivery/decision-heads/${request.run}/${request.plan}/${request.decision}.json`,
    ) as { pending?: string }
    if (head.pending !== digest) throw new DelegatedDecisionError('superseded-decision-intent')
  }

  private validateObservations(record: DelegatedDecision, rubric: DecisionRubric) {
    validateDeliveryShape(record, recordSchema)
    const { request, judgment, challenge, observations } = record
    if (
      judgment.basis !== record.basis ||
      challenge.basis !== record.basis ||
      challenge.judgment !== contractDigest(judgment) ||
      judgment.identity.role !== 'planner' ||
      challenge.identity.role !== 'challenger' ||
      ['assignment', 'worker', 'invocation'].some(
        (k) =>
          judgment.identity[k as keyof DecisionIdentity] ===
          challenge.identity[k as keyof DecisionIdentity],
      ) ||
      !rubric.outcomes.includes(judgment.outcome) ||
      observations.length !== request.evidence.length ||
      !uniqueDecisionValues(observations.map((o) => o.id)) ||
      request.evidence.some(
        (e) => !observations.some((o) => o.id === e.id && o.ref === e.ref && o.sha256 === e.sha256),
      ) ||
      !uniqueDecisionValues(judgment.uncertainties.map((u) => u.id)) ||
      !uniqueDecisionValues(challenge.uncertainties.map((u) => u.id))
    )
      throw new DelegatedDecisionError('independent-observation-binding')
  }
  private bytes(file: DecisionFile) {
    const bytes = readSourceBytes(this.files.root, file.ref, 1024 * 1024)
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
      throw new DelegatedDecisionError('changed-input')
    return bytes
  }
  private read(path: string): unknown {
    return JSON.parse(readSourceFile(this.files.root, path, 2 * 1024 * 1024))
  }
}
