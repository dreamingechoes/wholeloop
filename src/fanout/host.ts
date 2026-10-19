import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import type { FlowEngine } from '../flow/engine.js'
import {
  GATE_SCHEMAS,
  type GatePlan,
  type GateResult,
  type GateVote,
  validateGateResult,
  validateGateVote,
} from '../gates/contracts.js'
import type { GateHost } from '../gates/execution.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { measurementDigest } from '../launch/measurement.js'
import type { ReviewContext } from '../review/contracts.js'
import type { HeadlessAdapter } from './adapters.js'
import { workerProcess } from './process.js'

export interface HeadlessOptions {
  adapter: HeadlessAdapter
  concurrency?: number
  timeoutMs?: number
  signal?: AbortSignal
  env?: NodeJS.ProcessEnv
}
export interface WorkerRecord {
  schema: 'wholeloop/headless-worker@1'
  assignment: string
  adapter: string
  run: string
  round: number
  role: 'inspect' | 'refute'
  status: string
  code: number | null
  signal: NodeJS.Signals | null
  path: string
}

export class HeadlessHost implements GateHost {
  readonly records: WorkerRecord[] = []
  readonly controller = new AbortController()
  readonly concurrency: number
  readonly timeoutMs: number
  private active = 0
  private waiting: (() => void)[] = []
  private readonly disconnect: () => void
  constructor(
    readonly engine: FlowEngine,
    readonly options: HeadlessOptions,
  ) {
    this.concurrency = options.concurrency ?? 4
    this.timeoutMs = options.timeoutMs ?? 120000
    if (
      !Number.isInteger(this.concurrency) ||
      this.concurrency < 1 ||
      this.concurrency > 16 ||
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 100 ||
      this.timeoutMs > 600000
    )
      throw new Error('Headless concurrency must be 1..16 and timeout 100..600000 ms')
    const abort = () => this.stop()
    options.signal?.addEventListener('abort', abort, { once: true })
    this.disconnect = () => options.signal?.removeEventListener('abort', abort)
    if (options.signal?.aborted) this.stop()
  }
  stop() {
    this.controller.abort()
    for (const release of this.waiting.splice(0)) release()
  }
  stopped() {
    return this.controller.signal.aborted
  }
  close() {
    this.stop()
    this.disconnect()
  }
  private async worker(
    plan: GatePlan,
    role: 'inspect' | 'refute',
    assignment: Record<string, unknown>,
    review?: ReviewContext,
  ) {
    if (this.active >= this.concurrency)
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    if (this.stopped()) throw new Error('Headless worker cancelled')
    this.active++
    try {
      if (workspaceSnapshot(plan.repository).digest !== plan.snapshot.digest) {
        this.stop()
        throw new Error('Workspace changed before headless worker')
      }
      const suite = gateRuns(this.engine.store.events())
        .find((run) => run.run === plan.run)
        ?.rounds.find((round) => round.plan.round === plan.round)
        ?.results.find((result) => result.unit === 'suite')
      const identity = measurementDigest({ plan, role, assignment, review, suite })
      const path = `fanout/${plan.run}/${plan.round}/${identity}/${randomUUID()}`
      const directory = this.engine.store.files.path(path)
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      const payload = {
        schema: 'wholeloop/headless-assignment@1',
        assignment: identity,
        run: plan.run,
        round: plan.round,
        role,
        repository: plan.repository,
        gate: plan.gate,
        unit: assignment,
        ...(suite ? { suite } : {}),
        ...(review
          ? {
              review: {
                diff: review.diff,
                rubric: review.rubric,
                previousFindings: review.previousFindings,
              },
            }
          : {}),
        response: {
          schema: 'wholeloop/headless-result@1',
          assignment: identity,
          run: plan.run,
          round: plan.round,
          [role === 'inspect' ? 'result' : 'vote']:
            role === 'inspect' ? GATE_SCHEMAS.result : GATE_SCHEMAS.vote,
        },
        instructions:
          'Inspect only the assigned repository evidence. Read repository instructions and use read-only inspection only. Do not edit, run suites, use network/MCP, submit state or ask questions. Return one JSON object matching response; use actual evidence, and unavailable/uncertain when observation is missing. The schema object under result/vote describes that field, not its value.',
      }
      const input = JSON.stringify(payload)
      if (Buffer.byteLength(input) > 2 * 1024 * 1024)
        throw new Error('Headless assignment exceeds 2 MiB; narrow the review')
      const invocation = this.options.adapter.invocation({ repository: plan.repository, directory })
      const observed = await workerProcess(invocation.command, invocation.args, {
        cwd: directory,
        input,
        timeoutMs: this.timeoutMs,
        signal: this.controller.signal,
        env: { ...process.env, ...this.options.env, ...invocation.env },
      })
      let status: string = observed.status
      let value: GateResult | GateVote | undefined
      if (workspaceSnapshot(plan.repository).digest !== plan.snapshot.digest) {
        status = 'changed'
        this.stop()
      } else if (status === 'succeeded') {
        try {
          const raw = this.options.adapter.response(observed.stdout, directory)
          if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Oversized worker response')
          const envelope: unknown = JSON.parse(raw)
          const field = role === 'inspect' ? 'result' : 'vote'
          if (
            !isObject(envelope) ||
            Object.keys(envelope).some(
              (key) => !['schema', 'assignment', 'run', 'round', field].includes(key),
            ) ||
            envelope.schema !== 'wholeloop/headless-result@1' ||
            envelope.assignment !== identity ||
            envelope.run !== plan.run ||
            envelope.round !== plan.round
          )
            throw new Error('Mismatched assignment response')
          value = envelope[field] as GateResult | GateVote
          if (role === 'inspect') {
            validateGateResult(value)
            if (value.unit !== assignment.id) throw new Error('Wrong unit')
          } else {
            validateGateVote(value)
            if (value.finding !== assignment.finding || value.verifier !== assignment.verifier)
              throw new Error('Wrong refutation')
          }
        } catch {
          status = 'invalid'
          value = undefined
        }
      }
      const record: WorkerRecord = {
        schema: 'wholeloop/headless-worker@1',
        assignment: identity,
        adapter: this.options.adapter.id,
        run: plan.run,
        round: plan.round,
        role,
        status,
        code: observed.code,
        signal: observed.signal,
        path: `${path}/worker.json`,
      }
      this.engine.store.files.atomic(record.path, `${JSON.stringify(record, null, 2)}\n`)
      this.records.push(record)
      if (!value || status !== 'succeeded')
        throw new Error(`Headless worker ${status}; inspect ${record.path}`)
      return value
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
  async inspect(
    plan: GatePlan,
    unit: GatePlan['units'][number],
    review?: ReviewContext,
  ): Promise<GateResult> {
    if (unit.id === 'suite')
      throw new Error('Run the real once-per-round suite before read-only fan-out')
    try {
      return (await this.worker(plan, 'inspect', { ...unit }, review)) as GateResult
    } catch (error) {
      return {
        unit: unit.id,
        status: 'unavailable',
        evidence: [],
        findings: [],
        reason: error instanceof Error ? error.message : 'Headless worker unavailable',
      }
    }
  }
  async refute(
    plan: GatePlan,
    finding: string,
    verifier: number,
    review?: ReviewContext,
  ): Promise<GateVote> {
    const round = gateRuns(this.engine.store.events())
      .find((run) => run.run === plan.run)
      ?.rounds.find((round) => round.plan.round === plan.round)
    const evidence = round?.results.flatMap((result) =>
      result.findings
        .filter((entry) => `${result.unit}:${entry.id}` === finding)
        .map((entry) => ({ unit: result.unit, finding: entry })),
    )
    if (evidence?.length !== 1) throw new Error('Refutation needs its exact recorded finding')
    return (await this.worker(
      plan,
      'refute',
      { finding, verifier, evidence: evidence[0] },
      review,
    )) as GateVote
  }
}
