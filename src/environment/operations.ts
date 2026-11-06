import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import type { StoreFiles } from '../state/files.js'
import { inReadObservation, observedRead } from '../state/read-observation.js'
import {
  DockerEnvironmentError,
  type DockerResult,
  type DockerTransport,
} from './docker-command.js'
import { EnvironmentResources } from './runtime.js'
import execReleaseSchema from './schemas/exec-release-v1.json' with { type: 'json' }
import fenceSchema from './schemas/fence-v1.json' with { type: 'json' }
import cancelSchema from './schemas/operation-cancel-v1.json' with { type: 'json' }
import closeSchema from './schemas/operation-close-v1.json' with { type: 'json' }
import outcomeSchema from './schemas/operation-outcome-v1.json' with { type: 'json' }
import startedSchema from './schemas/operation-started-v1.json' with { type: 'json' }
import operationSchema from './schemas/operation-v1.json' with { type: 'json' }
import execOperationSchema from './schemas/operation-v2.json' with { type: 'json' }
import trackingSchema from './schemas/provision-tracking-v1.json' with { type: 'json' }

export interface DockerOperationRegistration {
  operation: string
  nonce: string
  cancel: string
  outcome: string
  started(pid: number): void
}
export interface EnvironmentOperation {
  schema: 'wholeloop/environment-operation@1' | 'wholeloop/environment-operation@2'
  id: string
  environment: string
  nonce: string
  action: 'create' | 'start' | 'stop' | 'remove' | 'pull' | 'exec'
  resource?: string
  command: string
  at: string
  timeoutMs: number
  provenance: 'fixture' | 'host-observed'
}
export function environmentFenced(files: StoreFiles, environment: string): boolean {
  const path = fencePath(environment)
  if (!existsSync(files.path(path))) return false
  const value = JSON.parse(readSourceFile(files.root, path, 65536))
  validateDeliveryShape(value, fenceSchema)
  if (value.environment !== environment)
    throw new DockerEnvironmentError('invalid-environment-fence')
  return true
}
function fencePath(environment: string) {
  if (!/^environment-[a-f0-9]{32}$/.test(environment))
    throw new DockerEnvironmentError('invalid-environment-id')
  return `delivery/environment-control/${environment}/fence.json`
}
export class EnvironmentOperations {
  constructor(
    readonly files: StoreFiles,
    readonly environment: string,
    readonly provenance: DockerTransport['provenance'],
  ) {
    fencePath(environment)
  }
  activateProvisioning() {
    this.files.locked(() => {
      const record = new EnvironmentResources(this.files).get(this.environment).record
      if (
        record.state !== 'provisioning' ||
        !record.invocation ||
        record.resources.length ||
        environmentFenced(this.files, this.environment)
      )
        throw new DockerEnvironmentError('invalid-provision-tracking')
      const value = {
        schema: 'wholeloop/environment-provision-tracking@1',
        environment: this.environment,
        effect: record.effect,
        invocation: record.invocation,
        at: new Date().toISOString(),
        provenance: this.provenance,
      }
      validateDeliveryShape(value, trackingSchema)
      const path = `delivery/environment-operations/${this.environment}/provision.json`
      if (existsSync(this.files.path(path)))
        throw new DockerEnvironmentError('provision-tracking-already-bound')
      this.files.atomic(path, `${JSON.stringify(value)}\n`)
    })
  }
  provisionTracked() {
    const path = `delivery/environment-operations/${this.environment}/provision.json`
    if (!existsSync(this.files.path(path))) return false
    const value = JSON.parse(readSourceFile(this.files.root, path, 65536))
    validateDeliveryShape(value, trackingSchema)
    const record = new EnvironmentResources(this.files).get(this.environment).record
    if (
      value.environment !== record.id ||
      value.effect !== record.effect ||
      value.invocation !== record.invocation ||
      value.provenance !== record.provenance
    )
      throw new DockerEnvironmentError('changed-provision-tracking')
    return true
  }
  fence(request: string, reason: string) {
    this.files.locked(() => {
      if (environmentFenced(this.files, this.environment)) return
      const value = {
        schema: 'wholeloop/environment-fence@1',
        environment: this.environment,
        request,
        reason,
        at: new Date().toISOString(),
      }
      safeSourceText(JSON.stringify(value), 8192)
      validateDeliveryShape(value, fenceSchema)
      this.files.atomic(fencePath(this.environment), `${JSON.stringify(value)}\n`)
    })
  }
  begin(args: string[], timeoutMs: number, cleanup = false): DockerOperationRegistration {
    const action = this.action(args)
    const operation: EnvironmentOperation = {
      schema:
        action === 'exec'
          ? 'wholeloop/environment-operation@2'
          : 'wholeloop/environment-operation@1',
      id: `operation-${randomUUID()}`,
      environment: this.environment,
      nonce: randomUUID(),
      action,
      ...(action === 'exec' ? { resource: args[3] ?? '' } : {}),
      command: contractDigest(args),
      at: new Date().toISOString(),
      timeoutMs,
      provenance: this.provenance,
    }
    this.files.locked(() => {
      if (action === 'exec') {
        const resources = new EnvironmentResources(this.files).get(this.environment).record
          .resources
        if (
          args[0] !== 'container' ||
          args[2] !== '--interactive' ||
          !resources.some(
            (resource) =>
              resource.kind === 'container' &&
              resource.purpose === 'service' &&
              resource.id === operation.resource,
          )
        )
          throw new DockerEnvironmentError('unowned-exec-operation')
        if (
          this.list().some(
            (prior) => prior.action === 'exec' && !this.read(prior.id, 'exec-release'),
          )
        )
          throw new DockerEnvironmentError('prior-exec-unresolved')
      }
      if (cleanup && !['stop', 'remove'].includes(operation.action))
        throw new DockerEnvironmentError('invalid-cleanup-operation')
      if (['stop', 'remove'].includes(operation.action)) {
        const resources = new EnvironmentResources(this.files).get(this.environment).record
          .resources
        if (!resources.some((resource) => resource.kind === args[0] && resource.id === args.at(-1)))
          throw new DockerEnvironmentError('unowned-cleanup-operation')
      }
      if (environmentFenced(this.files, this.environment) && !cleanup)
        throw new DockerEnvironmentError('environment-fenced')
      if (this.list().length >= 1000)
        throw new DockerEnvironmentError('environment-operation-limit')
      validateDeliveryShape(operation, action === 'exec' ? execOperationSchema : operationSchema)
      this.files.atomic(`${this.path(operation.id)}/request.json`, `${JSON.stringify(operation)}\n`)
    })
    return {
      operation: operation.id,
      nonce: operation.nonce,
      cancel: this.files.path(`${this.path(operation.id)}/cancel.json`),
      outcome: this.files.path(`${this.path(operation.id)}/outcome.json`),
      started: (pid) => {
        if (!Number.isSafeInteger(pid) || pid < 1)
          throw new DockerEnvironmentError('invalid-operation-pid')
        this.files.locked(() => {
          if (environmentFenced(this.files, this.environment) && !cleanup)
            throw new DockerEnvironmentError('environment-fenced')
          const existing = this.read(operation.id, 'started')
          if (existing) {
            validateDeliveryShape(existing, startedSchema)
            if (existing.pid !== pid || existing.nonce !== operation.nonce)
              throw new DockerEnvironmentError('changed-operation-start')
            return
          }
          this.files.atomic(
            `${this.path(operation.id)}/started.json`,
            `${JSON.stringify({ schema: 'wholeloop/environment-operation-started@1', operation: operation.id, nonce: operation.nonce, pid, at: new Date().toISOString() })}\n`,
          )
        })
      },
    }
  }
  close(registration: DockerOperationRegistration, result: DockerResult) {
    const operation = this.get(registration.operation)
    if (operation.nonce !== registration.nonce)
      throw new DockerEnvironmentError('changed-operation-binding')
    if (this.read(operation.id, 'client-close')) {
      const existing = this.read(operation.id, 'client-close')
      if (
        existing?.status !== result.status ||
        existing?.evidence !== result.digest ||
        (existing?.code ?? null) !== result.code
      )
        throw new DockerEnvironmentError('changed-operation-close')
      return
    }
    this.files.atomic(
      `${this.path(operation.id)}/client-close.json`,
      `${JSON.stringify({ schema: 'wholeloop/environment-operation-close@1', operation: operation.id, nonce: operation.nonce, status: result.status, ...(result.code !== null ? { code: result.code } : {}), evidence: result.digest, at: new Date().toISOString() })}\n`,
    )
  }
  cancelAll() {
    this.files.locked(() => {
      if (!environmentFenced(this.files, this.environment))
        throw new DockerEnvironmentError('missing-environment-fence')
      for (const operation of this.list()) {
        const path = `${this.path(operation.id)}/cancel.json`
        if (!existsSync(this.files.path(path)))
          this.files.atomic(
            path,
            `${JSON.stringify({ schema: 'wholeloop/environment-operation-cancel@1', operation: operation.id, nonce: operation.nonce, at: new Date().toISOString() })}\n`,
          )
      }
    })
  }
  cancel(registration: DockerOperationRegistration) {
    this.files.locked(() => {
      const operation = this.get(registration.operation)
      if (operation.nonce !== registration.nonce)
        throw new DockerEnvironmentError('changed-operation-binding')
      if (!this.read(operation.id, 'cancel'))
        this.files.atomic(
          `${this.path(operation.id)}/cancel.json`,
          `${JSON.stringify({ schema: 'wholeloop/environment-operation-cancel@1', operation: operation.id, nonce: operation.nonce, at: new Date().toISOString() })}\n`,
        )
    })
  }
  completion(args: string[], pid: number) {
    const matching = this.list().filter(
      (operation) =>
        operation.command === contractDigest(args) &&
        this.read(operation.id, 'started')?.pid === pid,
    )
    if (matching.length !== 1) return undefined
    const operation = matching[0]
    if (!operation) return undefined
    // list/get validates nonce, actual registered invoker and the closed outcome before this read.
    const outcome = this.read(operation.id, 'outcome')
    if (
      outcome?.reason !== 'finished' ||
      outcome.signal !== undefined ||
      !Number.isInteger(outcome.code) ||
      Number(outcome.code) < 0 ||
      Number(outcome.code) > 255
    )
      return undefined
    return { operation: operation.id, code: Number(outcome.code), at: String(outcome.at) }
  }
  releaseExec(registration: DockerOperationRegistration, evidence: string) {
    this.files.locked(() => {
      const operation = this.get(registration.operation)
      const started = this.read(operation.id, 'started'),
        outcome = this.read(operation.id, 'outcome'),
        closed = this.read(operation.id, 'client-close')
      if (
        operation.action !== 'exec' ||
        operation.nonce !== registration.nonce ||
        !started ||
        outcome?.reason !== 'finished' ||
        outcome.code !== 0 ||
        outcome.signal !== undefined ||
        closed?.status !== 'succeeded' ||
        closed.code !== 0 ||
        operationGroup(Number(started.pid)).status !== 'absent'
      )
        throw new DockerEnvironmentError('exec-invoker-unresolved')
      const existing = this.read(operation.id, 'exec-release')
      if (existing) return
      const release = {
        schema: 'wholeloop/environment-exec-release@1',
        environment: this.environment,
        operation: operation.id,
        nonce: operation.nonce,
        resource: operation.resource,
        pid: started.pid,
        at: new Date().toISOString(),
        evidence,
        provenance: this.provenance,
      }
      validateDeliveryShape(release, execReleaseSchema)
      this.files.atomic(
        `${this.path(operation.id)}/exec-release.json`,
        `${JSON.stringify(release)}\n`,
      )
    })
  }
  inspect() {
    const entries = this.list().map((operation) => ({
      operation,
      started: this.read(operation.id, 'started'),
    }))
    const processes = processTable()
    return entries.map(({ operation, started }) => {
      if (!started)
        return {
          operation,
          status: environmentFenced(this.files, this.environment) ? 'not-started' : 'unknown',
          evidence: contractDigest({ operation: operation.id, started: false }),
        }
      if (
        started.schema !== 'wholeloop/environment-operation-started@1' ||
        started.operation !== operation.id ||
        started.nonce !== operation.nonce ||
        !Number.isSafeInteger(started.pid) ||
        Number(started.pid) < 1
      )
        throw new DockerEnvironmentError('invalid-operation-start')
      const group = processObservation(Number(started.pid), true, processes)
      return {
        operation,
        status: group.status === 'absent' ? 'stopped' : 'unknown',
        evidence: contractDigest({ operation: operation.id, group }),
      }
    })
  }
  list(): EnvironmentOperation[] {
    const path = this.files.path(`delivery/environment-operations/${this.environment}`)
    if (!existsSync(path)) return []
    if (
      existsSync(
        this.files.path(`delivery/environment-operations/${this.environment}/provision.json`),
      )
    )
      this.provisionTracked()
    const names = readdirSync(path).filter((name) => name !== 'provision.json')
    if (names.some((id) => !/^operation-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)))
      throw new DockerEnvironmentError('unknown-operation-format')
    return names.sort().map((id) => this.get(id))
  }

  private get(id: string): EnvironmentOperation {
    const value = JSON.parse(
      readSourceFile(this.files.root, `${this.path(id)}/request.json`, 65536),
    )
    validateDeliveryShape(
      value,
      value.schema === 'wholeloop/environment-operation@2' ? execOperationSchema : operationSchema,
    )
    if (value.id !== id || value.environment !== this.environment)
      throw new DockerEnvironmentError('changed-operation-binding')
    const files = readdirSync(this.files.path(this.path(id)))
    if (
      files.some(
        (name) =>
          ![
            'request.json',
            'started.json',
            'outcome.json',
            'client-close.json',
            'cancel.json',
            ...(value.schema === 'wholeloop/environment-operation@2' ? ['exec-release.json'] : []),
          ].includes(name) && !name.endsWith('.tmp'),
      )
    )
      throw new DockerEnvironmentError('unknown-operation-format')
    // Each record is read once: the process checks below use the same bytes this
    // loop validated instead of a second, unvalidated read (ADR-0244).
    const validated = new Map<string, Record<string, unknown>>()
    for (const [name, schema] of [
      ['started', startedSchema],
      ['outcome', outcomeSchema],
      ['client-close', closeSchema],
      ['cancel', cancelSchema],
    ] as const) {
      const entry = this.read(id, name)
      if (!entry) continue
      validateDeliveryShape(entry, schema)
      if (entry.operation !== id || entry.nonce !== value.nonce)
        throw new DockerEnvironmentError('changed-operation-binding')
      validated.set(name, entry)
    }
    const started = validated.get('started'),
      outcome = validated.get('outcome')
    if (outcome && (!started || outcome.pid !== started.pid))
      throw new DockerEnvironmentError('changed-operation-process')
    const release = this.read(id, 'exec-release')
    if (release) {
      validateDeliveryShape(release, execReleaseSchema)
      if (
        value.schema !== 'wholeloop/environment-operation@2' ||
        release.operation !== id ||
        release.environment !== this.environment ||
        release.nonce !== value.nonce ||
        release.resource !== value.resource ||
        release.pid !== started?.pid ||
        release.provenance !== value.provenance
      )
        throw new DockerEnvironmentError('changed-exec-release')
    }
    return value as EnvironmentOperation
  }
  private read(id: string, name: string): Record<string, unknown> | undefined {
    const path = `${this.path(id)}/${name}.json`
    return existsSync(this.files.path(path))
      ? (JSON.parse(readSourceFile(this.files.root, path, 65536)) as Record<string, unknown>)
      : undefined
  }
  private path(id: string) {
    if (!/^operation-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
      throw new DockerEnvironmentError('invalid-operation-id')
    return `delivery/environment-operations/${this.environment}/${id}`
  }
  private action(args: string[]): EnvironmentOperation['action'] {
    if (args[0] === 'container' && args[1] === 'exec') return 'exec'
    if (args[0] === 'image' && args[1] === 'pull') return 'pull'
    if (args[1] === 'create') return 'create'
    if (args[1] === 'start') return 'start'
    if (args[1] === 'stop') return 'stop'
    if (args[1] === 'rm') return 'remove'
    throw new DockerEnvironmentError('unsupported-owned-operation')
  }
}
/** Presence is deliberately unknown, never permission to signal a stored or reused PID. */
function processTable(): { pid: number; group: number }[] | undefined {
  if (!inReadObservation()) return readProcessTable()
  return observedRead('process-table', () => {
    const value = readProcessTable()
    // Seal availability here and exact requested members below. Unrelated
    // processes may change; each validation still gets a fresh common table.
    return { bytes: Buffer.from([Number(value !== undefined)]), value }
  })
}
function readProcessTable(): { pid: number; group: number }[] | undefined {
  const result = spawnSync('ps', ['-axo', 'pid=,pgid='], {
    encoding: 'utf8',
    timeout: 2000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.status !== 0 || result.error) return undefined
  const lines = result.stdout.split('\n').filter((line) => line.trim())
  if (lines.some((line) => !/^\s*\d+\s+\d+\s*$/.test(line))) return undefined
  return lines.map((line) => {
    const [pid, group] = line.trim().split(/\s+/).map(Number)
    return { pid: Number(pid), group: Number(group) }
  })
}
function processObservation(pid: number, group: boolean, table: ReturnType<typeof processTable>) {
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw new DockerEnvironmentError('invalid-operation-pid')
  if (!table) return { status: 'unknown' as const, evidence: contractDigest({ available: false }) }
  const members = table
    .filter((value) => (group ? value.group : value.pid) === pid)
    .map((value) => value.pid)
  return {
    status: members.length ? ('present' as const) : ('absent' as const),
    evidence: contractDigest({ pid, members }),
  }
}
export function operationGroup(pid: number) {
  return observedProcess(pid, true)
}
function observedProcess(pid: number, group: boolean) {
  if (!inReadObservation()) return processObservation(pid, group, processTable())
  return {
    ...observedRead(`process-presence:${group}:${pid}`, () => {
      const value = processObservation(pid, group, processTable())
      return { bytes: Buffer.from(JSON.stringify(value)), value }
    }),
  }
}
/** One fresh table for a bounded ownership observation, never a cached grant to signal. */
export function operationGroups(pids: readonly number[]) {
  if (pids.length > 1000 || pids.some((pid) => !Number.isSafeInteger(pid) || pid < 1))
    throw new DockerEnvironmentError('invalid-operation-pid')
  if (!pids.length) return new Map<number, ReturnType<typeof operationGroup>>()
  if (inReadObservation()) return new Map(pids.map((pid) => [pid, observedProcess(pid, true)]))
  const table = processTable()
  return new Map(pids.map((pid) => [pid, processObservation(pid, true, table)]))
}
export function processPresence(pid: number) {
  return observedProcess(pid, false).status
}
export class TrackedDockerTransport implements DockerTransport {
  readonly provenance: DockerTransport['provenance']
  constructor(
    readonly driver: DockerTransport,
    readonly operations: EnvironmentOperations,
    readonly cleanup = false,
  ) {
    this.provenance = driver.provenance
  }
  async call(args: string[], options: Parameters<DockerTransport['call']>[1] = {}) {
    if (!['create', 'start', 'stop', 'rm', 'pull'].includes(args[1] ?? ''))
      return this.driver.call(args, options)
    const registration = this.operations.begin(
      args,
      options?.timeoutMs ?? 10000,
      this.cleanup || args[1] === 'stop',
    )
    const result = await this.driver.call(args, { ...options, registration })
    this.operations.close(registration, result)
    return result
  }
}
