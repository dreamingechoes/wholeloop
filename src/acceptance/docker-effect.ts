import { createHash } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import { currentBudgetReservation } from '../delivery/budget-policy.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import { DeliveryEffects } from '../delivery/effects.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { EnvironmentLifecycle } from '../environment/lifecycle.js'
import {
  EnvironmentOperations,
  environmentFenced,
  TrackedDockerTransport,
} from '../environment/operations.js'
import { EnvironmentResources } from '../environment/runtime.js'
import {
  type AcceptanceArtifact,
  type AcceptanceCase,
  type AcceptanceCaseResult,
  AcceptanceError,
} from './contracts.js'
import { DockerBehaviorRuntime } from './docker-runtime.js'
import type { AcceptanceHost, DeliveryAcceptance } from './store.js'

/** Fixed source-code host. A worker can supply data, never an executable callback or process receipt. */
export interface CollectedDockerObservation {
  observation: unknown
  execution?: unknown
  assertions: { id: string; status: 'passed' | 'failed' | 'unavailable' }[]
  process?: NonNullable<AcceptanceCaseResult['process']>
  captures?: { label: string; bytes: Uint8Array; mediaType: AcceptanceArtifact['mediaType'] }[]
}
export abstract class DockerObservedHost implements AcceptanceHost {
  abstract readonly id: string
  readonly version = '1'
  readonly capability: string
  readonly provenance: DockerTransport['provenance']
  readonly test: AcceptanceCase
  private readonly active = new Set<string>()
  private readonly effects = new Map<string, string>()
  pendingEffect(invocation: string) {
    return this.effects.get(invocation)
  }
  constructor(
    readonly acceptance: DeliveryAcceptance,
    readonly digest: string,
    readonly environment: string,
    readonly caseId: string,
    readonly driver: DockerTransport = new DockerCli(),
  ) {
    const test = acceptance.get(digest).plan.cases.find((c) => c.id === caseId)
    if (!test) throw new AcceptanceError('unknown-behavior-case')
    this.test = test
    this.capability = test.runner.capability
    this.provenance = driver.provenance
  }
  protected abstract observe(
    test: AcceptanceCase,
    context: Parameters<AcceptanceHost['execute']>[1],
    runtime: DockerBehaviorRuntime,
  ): Promise<CollectedDockerObservation>
  async execute(test: AcceptanceCase, context: Parameters<AcceptanceHost['execute']>[1]) {
    if (contractDigest(test) !== contractDigest(this.test))
      throw new AcceptanceError('changed-behavior-case')
    const { plan } = this.acceptance.assertCurrent(this.digest)
    const files = this.acceptance.planning.sources.files
    const records = new EnvironmentResources(files)
    const original = records.get(this.environment).record
    const effects = new DeliveryEffects(files.root)
    const state = effects.lifecycle.journal.get(plan.run)
    const grant = state.grant ? effects.lifecycle.authority.inspect(state.grant.id) : undefined
    const primary = this.acceptance.planning.getPlan(plan.run, plan.revision).plan.repositories[0]
    const scope = grant?.grant.repositories.find((r) => r.repository === primary?.id)
    if (
      !primary ||
      !scope ||
      original.state !== 'ready' ||
      original.basis !== plan.plan ||
      original.run !== plan.run ||
      original.grantDigest !== state.grant?.digest ||
      original.grant !== state.grant?.id ||
      original.provenance !== this.provenance ||
      context.bindings.environment !== this.environment
    )
      throw new AcceptanceError('behavior-environment-authority')
    const key = `behavior-${contractDigest(context.invocation).slice(0, 32)}`
    const prepared = effects.prepare(plan.run, {
      key,
      operation: 'test.run',
      repository: primary.id,
      ref: `${scope.topicPrefix}${scope.topicPrefix.endsWith('/') ? '' : '/'}acceptance/${key}`,
      expectedHead: primary.base,
      inputDigest: contractDigest({
        plan: this.digest,
        case: test.id,
        invocation: context.invocation,
        bindings: context.bindings,
      }),
    })
    this.effects.set(context.invocation, prepared.intent.id)
    const abort = new AbortController()
    const cancel = () => abort.abort()
    context.signal.addEventListener('abort', cancel, { once: true })
    if (context.signal.aborted) abort.abort()
    let effectInvocation: string | undefined
    const current = () => {
      const now = Date.now(),
        record = records.get(this.environment).record
      const latest = effects.lifecycle.journal.get(plan.run)
      const authority = latest.grant
        ? effects.lifecycle.authority.inspect(latest.grant.id)
        : undefined
      if (
        abort.signal.aborted ||
        now >= Date.parse(context.deadline) ||
        now >= Date.parse(record.lifetimeDeadline) ||
        environmentFenced(files, this.environment) ||
        record.state !== 'ready' ||
        latest.basis.digest !== plan.plan ||
        latest.source !== plan.source ||
        latest.grant?.digest !== original.grantDigest ||
        authority?.status !== 'active' ||
        authority.digest !== original.grantDigest ||
        !authority.grant.effects.includes('test.run') ||
        !authority.grant.effects.includes('report.write') ||
        latest.state !== 'waiting-external' ||
        !effectInvocation ||
        deliveryEffects(latest).records.find((effect) => effect.intent.id === prepared.intent.id)
          ?.invocation !== effectInvocation ||
        !currentBudgetReservation(latest, effectInvocation, effects.budgetClock())
      )
        throw new AcceptanceError('behavior-authority-or-deadline')
    }
    const tracked = new TrackedDockerTransport(
      this.driver,
      new EnvironmentOperations(files, this.environment, this.provenance),
    )
    const bounded: DockerTransport = {
      provenance: this.provenance,
      call: async (args, options = {}) => {
        current()
        if (['create', 'start', 'stop'].includes(args[1] ?? '')) {
          const result = await tracked.call(['info', '--format', '{{.ID}}'], {
            signal: abort.signal,
            timeoutMs: Math.max(1, Math.min(5000, Date.parse(context.deadline) - Date.now())),
          })
          if (result.status !== 'succeeded' || result.stdout.trim() !== original.daemon?.id)
            throw new AcceptanceError('changed-behavior-daemon')
          current()
        }
        return tracked.call(args, {
          ...options,
          signal: abort.signal,
          timeoutMs: Math.max(
            1,
            Math.min(options.timeoutMs ?? 10000, Date.parse(context.deadline) - Date.now()),
          ),
        })
      },
    }
    const runtime = new DockerBehaviorRuntime(
      this.acceptance,
      this.environment,
      context.invocation,
      bounded,
      current,
      abort.signal,
      context.deadline,
    )
    let collected: CollectedDockerObservation | undefined
    let completed = false
    let problem: string | undefined
    this.active.add(context.invocation)
    const watch = setInterval(() => {
      if (!effectInvocation || completed) return
      try {
        current()
      } catch {
        abort.abort()
      }
    }, 100)
    try {
      const effect = await effects.execute(plan.run, prepared.intent.id, {
        eligible: () => ({ allowed: true, provenance: this.provenance, evidence: prepared.digest }),
        invoke: async (_intent, invocation, signal) => {
          effectInvocation = invocation
          signal.addEventListener('abort', cancel, { once: true })
          if (signal.aborted) abort.abort()
          try {
            current()
            await runtime.daemon()
            collected = await this.observe(test, { ...context, signal: abort.signal }, runtime)
            current()
            completed = true
          } catch (error) {
            problem = error instanceof AcceptanceError ? error.problem : 'execution-incomplete'
          } finally {
            signal.removeEventListener('abort', cancel)
          }
        },
        observe: async (intent) => ({
          available: true,
          value: {
            binding: contractDigest(intent),
            status: completed ? 'applied' : 'unknown',
            evidence: contractDigest({
              observation: collected?.observation ?? null,
              assertions: collected?.assertions ?? [],
              completed,
              captures:
                collected?.captures?.map((c) => ({
                  label: c.label,
                  bytes: c.bytes.length,
                  sha256: createHash('sha256').update(c.bytes).digest('hex'),
                })) ?? [],
            }),
            provenance: this.provenance,
            invocationState: completed ? 'stopped' : 'unknown',
            reason: completed ? 'observed' : 'unavailable-read',
            ...(completed
              ? {
                  resource: {
                    ref: intent.ref,
                    revision: contractDigest(collected?.observation ?? null),
                  },
                }
              : {}),
          },
        }),
      })
      if (!completed || !collected || effect.status !== 'applied')
        throw new AcceptanceError(problem ?? 'behavior-outcome-unknown')
      // Only the exact observed effect permits continuation. Other unresolved effects still block it in the reducer.
      effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'The exact behavioral invocation completed and was observed.',
      })
      this.acceptance.assertCurrent(this.digest)
      const captures = (collected.captures ?? []).map((capture) => ({
        label: capture.label,
        artifact: context.capture(capture.bytes, capture.mediaType),
      }))
      const evidence = context.capture(
        Buffer.from(
          JSON.stringify({
            observation: collected.observation,
            ...(collected.execution ? { execution: collected.execution } : {}),
            ...(captures.length ? { captures } : {}),
            effect: effect.intent.id,
            provenance: this.provenance,
          }),
        ),
        'application/json',
      )
      return {
        status: collected.assertions.every((a) => a.status === 'passed')
          ? ('passed' as const)
          : ('failed' as const),
        reason: 'Objective assertions evaluated from complete observed application output.',
        origin: 'controller-observation' as const,
        invocationState: 'stopped' as const,
        assertions: collected.assertions.map((a) => ({ ...a, evidence })),
        artifacts: [evidence, ...captures.map((c) => c.artifact)],
        ...(collected.process ? { process: collected.process } : {}),
      }
    } finally {
      this.effects.delete(context.invocation)
      clearInterval(watch)
      context.signal.removeEventListener('abort', cancel)
      if (completed) this.active.delete(context.invocation)
    }
  }
  async stop(invocation: string): Promise<'stopped' | 'unknown'> {
    if (!this.active.has(invocation)) return 'unknown'
    const files = this.acceptance.planning.sources.files
    const current = new EnvironmentResources(files).get(this.environment)
    const result = await new EnvironmentLifecycle(files, this.driver).execute({
      schema: 'wholeloop/environment-lifecycle-request@1',
      id: `behavior-stop-${contractDigest(invocation).slice(0, 24)}`,
      environment: this.environment,
      expected: current.digest,
      action: 'stop',
      reason:
        'An incomplete behavioral action may still be running; fence and stop its exact owned environment.',
    })
    if (['stopped', 'retained', 'retired'].includes(result.state)) {
      this.active.delete(invocation)
      return 'stopped'
    }
    return 'unknown'
  }
}
