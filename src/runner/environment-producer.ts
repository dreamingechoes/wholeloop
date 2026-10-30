import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import type { EnvironmentProvisionRequest } from '../environment/provision.js'
import type { RunnerStageContext } from './engine.js'
import { originalPreparedEnvironment, type PreparedEnvironmentBody } from './environment-proof.js'
import { RunnerEnvironmentScope } from './environment-scope.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerStore } from './store.js'

export interface RunnerEnvironmentProducerResult {
  status: 'recorded-ready' | 'unknown'
  evidence: string
  environment?: PreparedEnvironmentBody['environment']
  provenance: 'host-observed' | 'fixture'
  readiness: 'historical-only'
  acceptance: 'not-established'
}

/** A ready input is budgeted original evidence, never a new provisioning or live-readiness grant. */
export class RunnerEnvironmentProducer {
  constructor(
    readonly store: RunnerStore,
    readonly phase: string,
  ) {
    if (!/^[a-f0-9]{64}$/.test(phase)) throw new DeliveryRunnerError('environment-producer-phase')
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('environment-producer-invocation')
    return `delivery/runner-environment-results/${invocation}/${this.phase}`
  }
  async prepare(
    inputContext: RunnerStageContext,
    request: EnvironmentProvisionRequest,
    driver: DockerTransport = new DockerCli(),
  ): Promise<RunnerEnvironmentProducerResult> {
    const context = Object.freeze({
        ...inputContext,
        request: structuredClone(inputContext.request),
        plan: structuredClone(inputContext.plan),
        stage: structuredClone(inputContext.stage),
        current: inputContext.current.bind(inputContext),
        started: inputContext.started.bind(inputContext),
      }),
      input = structuredClone(request),
      base = this.path(context.invocation),
      scope = new RunnerEnvironmentScope(this.store, context.invocation, this.phase),
      current = () => {
        if (
          context.signal.aborted ||
          !context.current() ||
          !Number.isFinite(Date.parse(context.deadline)) ||
          new Date(context.deadline).toISOString() !== context.deadline ||
          Date.now() >= Date.parse(context.deadline)
        )
          throw new DeliveryRunnerError('environment-producer-not-current')
      }
    current()
    const digest = contractDigest(context.request),
      actual = this.store.get(digest),
      basis = this.store.basis(actual),
      record = this.store.stage(digest, context.stage.id),
      stage = runnerRoute(basis.plan).find((entry) => entry.id === context.stage.id)
    if (
      !record ||
      record.invocation !== context.invocation ||
      record.basis !== basis.digest ||
      !['prepared', 'running'].includes(record.status) ||
      contractDigest(context.plan) !== basis.digest ||
      contractDigest(context.stage) !== contractDigest(stage ?? null) ||
      input.run !== actual.run ||
      !['verification', 'integration'].includes(context.stage.kind)
    )
      throw new DeliveryRunnerError('environment-producer-context-binding')
    if (
      existsSync(this.store.files.path(`${base}/consumed`)) ||
      existsSync(
        this.store.files.path(
          `delivery/runner-environments/${context.invocation}/${this.phase}.json.consumed`,
        ),
      )
    ) {
      const preparation = scope.originalPreparation(),
        origin = scope.origin()
      if (
        preparation &&
        (contractDigest(preparation.input) !== contractDigest(input) ||
          origin?.deadline !== context.deadline ||
          origin.request !== contractDigest(context.request) ||
          origin.plan !== contractDigest(context.plan) ||
          origin.stage !== context.stage.id)
      )
        throw new DeliveryRunnerError('environment-producer-input-conflict')
      return this.inspect(context.invocation)
    }
    const startedAt = new Date().toISOString(),
      result = await scope.provision(context, input, driver)
    current()
    if (result.status !== 'ready' || !result.environment || !result.effect)
      return this.inspect(context.invocation)
    const origin = scope.origin()
    if (!origin) throw new DeliveryRunnerError('environment-producer-original-scope-required')
    const { id } = result.environment.record,
      candidate = {
        version: 1 as const,
        origin,
        input: contractDigest(input),
        startedAt,
        completedAt: new Date().toISOString(),
        environment: {
          id,
          digest: result.environment.digest,
          sequence: result.environment.sequence,
        },
        effect: result.effect,
        preflight: result.preflight.evidence,
      },
      proof = originalPreparedEnvironment(scope, candidate, true),
      body: PreparedEnvironmentBody = { ...candidate, owners: proof.owners, native: proof.native },
      text = JSON.stringify(body)
    safeSourceText(text, 65536)
    current()
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('environment-producer-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${sourceHash(text)}\n`)
    })
    const captured = this.store.budgets.captureArtifact(context.request.run, Buffer.from(text))
    current()
    if (!captured.stored) return this.inspect(context.invocation)
    this.store.files.atomic(
      `${base}/result.json`,
      `${JSON.stringify({ artifact: captured.artifact.digest })}\n`,
    )
    return this.inspect(context.invocation)
  }
  inspect(invocation: string): RunnerEnvironmentProducerResult {
    const base = this.path(invocation),
      unknown: RunnerEnvironmentProducerResult = {
        status: 'unknown',
        evidence: contractDigest({ invocation, phase: this.phase, result: 'unavailable' }),
        provenance: 'fixture',
        readiness: 'historical-only',
        acceptance: 'not-established',
      }
    try {
      const locator = JSON.parse(readSourceFile(this.store.files.root, `${base}/result.json`, 1024))
      if (
        Object.keys(locator).join(',') !== 'artifact' ||
        !/^[a-f0-9]{64}$/.test(locator.artifact) ||
        readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !== locator.artifact
      )
        return unknown
      const scope = new RunnerEnvironmentScope(this.store, invocation, this.phase),
        preparation = scope.originalPreparation()
      if (!preparation) return unknown
      const ref = `delivery/artifacts/${preparation.input.run}/${locator.artifact}`,
        text = readSourceFile(this.store.files.root, ref, 65536),
        body = JSON.parse(text) as PreparedEnvironmentBody
      if (
        sourceHash(text) !== locator.artifact ||
        Object.keys(body).sort().join(',') !==
          'completedAt,effect,environment,input,native,origin,owners,preflight,startedAt,version' ||
        Object.keys(body.environment).sort().join(',') !== 'digest,id,sequence' ||
        !this.store.budgets
          .inspect(preparation.input.run)
          .artifacts.some(
            (artifact) =>
              artifact.digest === locator.artifact &&
              artifact.ref === ref &&
              artifact.status === 'observed',
          )
      )
        return unknown
      const proof = originalPreparedEnvironment(scope, body)
      if (proof.owners !== body.owners || proof.native !== body.native) return unknown
      return {
        ...unknown,
        status: 'recorded-ready',
        environment: body.environment,
        provenance: 'host-observed',
        evidence: contractDigest({
          artifact: locator.artifact,
          owners: proof.owners,
          native: proof.native,
        }),
      }
    } catch {
      return unknown
    }
  }
}
