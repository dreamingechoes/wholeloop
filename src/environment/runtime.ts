import { existsSync, readdirSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import type { StoreFiles } from '../state/files.js'
import { EnvironmentRecipeError } from './recipe.js'
import snapshotSchema from './schemas/runtime-snapshot-v1.json' with { type: 'json' }
import runtimeSchema from './schemas/runtime-v1.json' with { type: 'json' }

export interface EnvironmentResource {
  kind: 'container' | 'volume' | 'network'
  slot: string
  name: string
  token: string
  status: 'intent' | 'observed' | 'started' | 'exited' | 'stopped' | 'retired' | 'unknown'
  id?: string
  policy?: string
  stamp?: string
  service?: string
  purpose:
    | 'workspace'
    | 'data'
    | 'input'
    | 'service'
    | 'setup'
    | 'seed'
    | 'test'
    | 'readiness'
    | 'initialize'
    | 'network'
    | 'ingress'
    | 'proxy'
  exit?: number
  ports?: { container: number; host: number }[]
}
export interface EnvironmentRuntime {
  schema: 'wholeloop/environment-runtime@1'
  id: string
  run: string
  basis: string
  recipe: string
  key: string
  grant: string
  grantDigest: string
  token: string
  effect: string
  invocation?: string
  createdAt: string
  deadline: string
  lifetimeDeadline: string
  state:
    | 'planned'
    | 'provisioning'
    | 'ready'
    | 'failed'
    | 'unavailable'
    | 'unknown'
    | 'stopped'
    | 'retired'
    | 'retained'
  provenance: 'fixture' | 'host-observed'
  helperImage: string
  host: { os: string; architecture: string }
  daemon?: {
    id: string
    version: string
    os: string
    architecture: string
    cpus: number
    memoryBytes: number
  }
  candidates: {
    repository: string
    path: string
    head: string
    snapshot: string
    content: string
  }[]
  resources: EnvironmentResource[]
  observations: { stage: string; at: string; status: string; evidence: string; resource?: string }[]
  reason?: string
  acceptance: 'not-established'
  publication: 'not-performed'
}
export const ENVIRONMENT_RUNTIME_SCHEMA = runtimeSchema

/** Immutable snapshots preserve partial startup and ownership even when disposable indices disappear. */
export class EnvironmentResources {
  constructor(readonly files: StoreFiles) {}
  get(id: string): { record: EnvironmentRuntime; digest: string; sequence: number } {
    return this.read(id)
  }
  /** Resolve an exact historical binding only after validating its complete original chain. */
  snapshot(
    id: string,
    digest: string,
  ): { record: EnvironmentRuntime; digest: string; sequence: number } {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new EnvironmentRecipeError('invalid-runtime-snapshot')
    return this.read(id, digest)
  }
  private read(
    id: string,
    wanted?: string,
  ): { record: EnvironmentRuntime; digest: string; sequence: number } {
    const directory = this.directory(id)
    if (!existsSync(this.files.path(directory)))
      throw new EnvironmentRecipeError('unknown-environment')
    const names = readdirSync(this.files.path(directory))
      .filter((name) => name.endsWith('.json'))
      .sort()
    if (!names.length || names.length > 1000)
      throw new EnvironmentRecipeError('invalid-environment-history')
    let previous: string | undefined
    let latest: ReturnType<EnvironmentResources['get']> | undefined
    let selected: ReturnType<EnvironmentResources['get']> | undefined
    for (const [index, name] of names.entries()) {
      if (name !== `${String(index + 1).padStart(4, '0')}.json`)
        throw new EnvironmentRecipeError('incomplete-environment-history')
      const snapshot = JSON.parse(
        readSourceFile(this.files.root, `${directory}/${name}`, 8 * 1024 * 1024),
      ) as { schema: string; digest: string; previous?: string; sequence: number; record: unknown }
      validateDeliveryShape(snapshot, snapshotSchema)
      const { digest, ...body } = snapshot
      if (
        Object.keys(snapshot).some(
          (key) => !['schema', 'digest', 'previous', 'sequence', 'record'].includes(key),
        ) ||
        snapshot.schema !== 'wholeloop/environment-runtime-snapshot@1' ||
        snapshot.sequence !== index + 1 ||
        snapshot.previous !== previous ||
        digest !== contractDigest(body)
      )
        throw new EnvironmentRecipeError('damaged-environment-history')
      validateDeliveryShape(snapshot.record, runtimeSchema)
      const record = snapshot.record as EnvironmentRuntime
      if (
        record.id !== id ||
        (latest &&
          [
            'id',
            'run',
            'basis',
            'recipe',
            'key',
            'grant',
            'grantDigest',
            'token',
            'effect',
            'createdAt',
            'deadline',
            'lifetimeDeadline',
            'provenance',
            'helperImage',
            'host',
            'candidates',
          ].some(
            (key) =>
              contractDigest(record[key as keyof EnvironmentRuntime] ?? null) !==
              contractDigest(latest?.record[key as keyof EnvironmentRuntime] ?? null),
          ))
      )
        throw new EnvironmentRecipeError('changed-environment-identity')
      if (latest) this.next(latest.record, record)
      previous = digest
      latest = { record, digest, sequence: index + 1 }
      if (digest === wanted) selected = latest
    }
    if (!latest) throw new EnvironmentRecipeError('unknown-environment')
    if (wanted && !selected) throw new EnvironmentRecipeError('unknown-runtime-snapshot')
    if (selected) return selected
    return latest
  }
  create(
    record: EnvironmentRuntime,
    admit?: (existing: ReturnType<EnvironmentResources['list']>) => void,
  ) {
    return this.files.locked(() => {
      const path = this.directory(record.id)
      if (existsSync(this.files.path(path))) return this.get(record.id)
      admit?.(this.list())
      return this.write(record, 1)
    })
  }
  update(id: string, change: (record: EnvironmentRuntime) => void) {
    return this.files.locked(() => {
      const current = this.get(id)
      const record = structuredClone(current.record)
      change(record)
      if (contractDigest(record) === contractDigest(current.record)) return current
      this.next(current.record, record)
      this.write(record, current.sequence + 1, current.digest)
      return this.get(id)
    })
  }
  list() {
    const root = this.files.path('delivery/environments')
    return existsSync(root)
      ? readdirSync(root)
          .filter((id) => /^environment-[a-f0-9]{32}$/.test(id))
          .sort()
          .map((id) => this.get(id))
      : []
  }
  private next(previous: EnvironmentRuntime, record: EnvironmentRuntime) {
    for (const key of [
      'id',
      'run',
      'basis',
      'recipe',
      'key',
      'grant',
      'grantDigest',
      'token',
      'effect',
      'createdAt',
      'deadline',
      'lifetimeDeadline',
      'provenance',
      'helperImage',
      'host',
      'candidates',
    ] as const)
      if (contractDigest(previous[key]) !== contractDigest(record[key]))
        throw new EnvironmentRecipeError('changed-environment-identity')
    if (
      (previous.invocation && previous.invocation !== record.invocation) ||
      (previous.daemon && contractDigest(previous.daemon) !== contractDigest(record.daemon))
    )
      throw new EnvironmentRecipeError('changed-environment-identity')
    if (new Set(record.resources.map((entry) => entry.slot)).size !== record.resources.length)
      throw new EnvironmentRecipeError('duplicate-environment-resource')
    for (const old of previous.resources) {
      const current = record.resources.find((entry) => entry.slot === old.slot)
      if (
        !current ||
        [
          'kind',
          'slot',
          'name',
          'token',
          'service',
          'purpose',
          'policy',
          ...(old.id ? ['id', 'stamp'] : []),
        ].some(
          (key) =>
            contractDigest(old[key as keyof EnvironmentResource] ?? null) !==
            contractDigest(current[key as keyof EnvironmentResource] ?? null),
        )
      )
        throw new EnvironmentRecipeError('changed-resource-identity')
    }
    if (
      contractDigest(record.observations.slice(0, previous.observations.length)) !==
      contractDigest(previous.observations)
    )
      throw new EnvironmentRecipeError('changed-environment-observation')
  }
  private write(record: EnvironmentRuntime, sequence: number, previous?: string) {
    validateDeliveryShape(record, runtimeSchema)
    if (sequence > 1000) throw new EnvironmentRecipeError('environment-history-limit')
    const body = {
      schema: 'wholeloop/environment-runtime-snapshot@1',
      sequence,
      ...(previous ? { previous } : {}),
      record,
    }
    const digest = contractDigest(body)
    this.files.atomic(
      `${this.directory(record.id)}/${String(sequence).padStart(4, '0')}.json`,
      `${JSON.stringify({ ...body, digest })}\n`,
    )
    return { record, digest, sequence }
  }
  private directory(id: string) {
    if (!/^environment-[a-f0-9]{32}$/.test(id))
      throw new EnvironmentRecipeError('invalid-environment-id')
    return `delivery/environments/${id}`
  }
}
