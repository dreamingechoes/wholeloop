// Runs delegated decisions through a native model while the controller supplies identity and
// observes evidence.
import { createHash } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceBytes, safeSourceText } from '../delivery/input.js'
import type { NativeRunOptions, NativeRunReceipt } from '../delivery/native-host.js'
import type { NativePurposeAttempts, NativePurposeLease } from '../delivery/native-purpose.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import type { WorkerAssignment } from '../delivery/worker-protocol.js'
import { DelegatedDecisionError } from './policy.js'
import challengeSchema from './schemas/native-challenge-v1.json' with { type: 'json' }
import judgmentSchema from './schemas/native-judgment-v1.json' with { type: 'json' }
import type {
  DecisionChallenge,
  DecisionHostContext,
  DecisionIdentity,
  DecisionJudgment,
  DecisionRequest,
  DelegatedDecisionHost,
} from './store.js'

export const NATIVE_DECISION_SCHEMAS = { judgment: judgmentSchema, challenge: challengeSchema }
type ObservedEvidence = Pick<DelegatedDecisionHost, 'observeEvidence' | 'prerequisites'>
interface NativeDecisionOptions {
  native: NativeRunOptions
  environment: WorkerAssignment['environment']
  provenance: 'fixture' | 'host-observed'
}
interface CurrentDecision {
  basis: string
  identity: DecisionIdentity
  lease: NativePurposeLease
  receipt: NativeRunReceipt
}

/** Native models propose judgments; the controller supplies identity and observes evidence separately. */
export class NativeDelegatedDecisionHost implements DelegatedDecisionHost {
  readonly #completed = new Map<string, CurrentDecision>()
  constructor(
    readonly purposes: NativePurposeAttempts,
    readonly evidence: ObservedEvidence,
    readonly options: NativeDecisionOptions,
  ) {}
  observeEvidence(request: Readonly<DecisionRequest>) {
    return this.evidence.observeEvidence(request)
  }
  prerequisites(request: Readonly<DecisionRequest>) {
    const observed = this.evidence.prerequisites(request)
    return { ...observed, supported: observed.supported && this.options.native.host !== undefined }
  }
  async judge(context: DecisionHostContext): Promise<DecisionJudgment> {
    const observed = await this.invoke('planner', context)
    const value = observed.value as Omit<DecisionJudgment, 'identity'>
    return {
      identity: observed.identity,
      basis: value.basis,
      outcome: value.outcome,
      rationale: value.rationale,
      uncertainties: structuredClone(value.uncertainties),
    }
  }
  async challenge(
    context: DecisionHostContext,
    judgment: Readonly<DecisionJudgment>,
  ): Promise<DecisionChallenge> {
    if (!this.current(judgment.identity, context.basis))
      throw new DelegatedDecisionError('native-judgment-not-current')
    const observed = await this.invoke('challenger', context, judgment)
    const value = observed.value as Omit<DecisionChallenge, 'identity'>
    return {
      identity: observed.identity,
      basis: value.basis,
      judgment: value.judgment,
      verdict: value.verdict,
      rationale: value.rationale,
      uncertainties: structuredClone(value.uncertainties),
    }
  }
  current(identity: Readonly<DecisionIdentity>, basis: string): boolean {
    const record = this.#completed.get(contractDigest(identity))
    return (
      record?.basis === basis &&
      contractDigest(record.identity) === contractDigest(identity) &&
      this.purposes.completed(record.lease, record.receipt)
    )
  }

  private async invoke(
    role: 'planner' | 'challenger',
    context: DecisionHostContext,
    judgment?: Readonly<DecisionJudgment>,
  ) {
    if (context.signal.aborted) throw new DelegatedDecisionError('decision-interrupted')
    const key = contractDigest({ request: context.request, basis: context.basis, role }),
      files = this.purposes.queue.lifecycle.journal.files,
      root = `delivery/decision-native-inputs/${key}`,
      body = JSON.stringify({
        request: context.request,
        rubric: context.rubric,
        basis: context.basis,
        plan: context.plan,
        authorization: context.authorization,
        source: context.source,
        inputs: context.inputs,
        ...(judgment ? { judgment } : {}),
      })
    safeSourceText(body, 1024 * 1024)
    files.locked(() => {
      const previous = files.read(`${root}/artifacts/decision-inputs.json`)
      if (previous !== undefined && previous !== body)
        throw new DelegatedDecisionError('native-input-conflict')
      if (previous === undefined) files.atomic(`${root}/artifacts/decision-inputs.json`, body)
    })
    const schema = structuredClone(role === 'planner' ? judgmentSchema : challengeSchema)
    const brief = JSON.stringify({
      purpose: 'Evaluate only the pinned decision inputs and allowed rubric outcomes.',
      response: schema,
      basis: context.basis,
      ...(judgment ? { judgment: contractDigest(judgment) } : {}),
      // The first live trial showed judges inventing their own uncertainty IDs,
      // which the store blocks because the rubric does not own them. Naming the
      // owned IDs changes no rule: any other uncertainty still blocks.
      uncertainties: {
        owned: [...context.rubric.unknowns.allowed],
        rule: 'Use only these uncertainty ids. Report any other material uncertainty anyway; it blocks the decision, so the run stops honestly instead of claiming support.',
      },
      output:
        'Return exactly one complete inline report at artifacts/decision.json. Its JSON body follows the supplied response schema and exact basis/judgment. Put all uncertainties in that body; keep outer findings/criteria/unknowns empty. Never supply identity, runtime, authority or human approval.',
    })
    const lease = this.purposes.claim({
      run: context.request.run,
      grant: context.request.grant,
      decision: context.request.decision,
      key,
      role,
      brief,
      environment: this.options.environment,
      contextRoot: files.path(root),
      provenance: this.options.provenance,
      context: [
        {
          kind: 'source',
          audience: 'shared',
          artifact: {
            ref: 'artifacts/decision-inputs.json',
            bytes: Buffer.byteLength(body),
            sha256: createHash('sha256').update(body).digest('hex'),
          },
        },
      ],
      deadline: context.deadline,
    })
    const receipt = await this.purposes.run(lease, {
      ...this.options.native,
      signal: context.signal,
    })
    if (
      !this.purposes.completed(lease, receipt) ||
      receipt.result?.status !== 'complete' ||
      receipt.result.findings.length ||
      receipt.result.criteria.length ||
      receipt.result.unknowns.length ||
      receipt.result.artifacts.length !== 1 ||
      receipt.artifacts?.length !== 1
    )
      throw new DelegatedDecisionError('native-decision-not-completed')
    const report = receipt.result.artifacts[0],
      captured = receipt.artifacts[0]
    if (
      !report ||
      !captured ||
      report.ref !== 'artifacts/decision.json' ||
      report.kind !== 'report' ||
      captured.worker !== report.ref
    )
      throw new DelegatedDecisionError('native-decision-report')
    const bytes = readSourceBytes(files.root, captured.ref, 256 * 1024)
    if (
      bytes.length !== captured.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== captured.digest
    )
      throw new DelegatedDecisionError('native-decision-report-bytes')
    let value: Record<string, unknown>
    try {
      value = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
      validateDeliveryShape(value, schema)
    } catch {
      throw new DelegatedDecisionError('native-decision-claim')
    }
    if (
      value.basis !== context.basis ||
      (judgment && value.judgment !== contractDigest(judgment)) ||
      (role === 'planner' &&
        !context.rubric.outcomes.includes(value.outcome as DecisionJudgment['outcome']))
    )
      throw new DelegatedDecisionError('native-decision-binding')
    const execution = receipt.execution
    if (!execution) throw new DelegatedDecisionError('native-decision-execution')
    const identity: DecisionIdentity = {
      assignment: lease.assignment.assignment,
      invocation: lease.assignment.identity.attempt,
      worker: execution.runtime.worker,
      role,
      runtime: contractDigest(execution.runtime),
      state: 'completed',
      provenance: execution.provenance,
    }
    this.#completed.set(contractDigest(identity), {
      identity,
      basis: context.basis,
      lease,
      receipt,
    })
    return { identity, value }
  }
}
