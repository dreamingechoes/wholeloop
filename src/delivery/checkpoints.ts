import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import {
  type CheckpointPayload,
  type CheckpointStage,
  deliveryCheckpoints,
} from './checkpoint-events.js'
import { DeliveryJournalError } from './events.js'
import { readSourceBytes, readSourceFile } from './input.js'
import { DeliveryLifecycle } from './lifecycle.js'
import { validateDeliveryShape } from './plan.js'
import manifestSchema from './schemas/checkpoint-manifest-v1.json' with { type: 'json' }
import requestSchema from './schemas/checkpoint-request-v1.json' with { type: 'json' }

export const CHECKPOINT_REQUEST_SCHEMA = requestSchema
export const CHECKPOINT_MANIFEST_SCHEMA = manifestSchema
interface CheckpointRequest {
  schema: 'wholeloop/delivery-checkpoint-request@1'
  key: string
  stage: CheckpointStage
  inputs: string[]
  attempt?: { id: string; generation: number }
}
export interface CheckpointManifest extends Omit<CheckpointRequest, 'schema' | 'inputs'> {
  schema: 'wholeloop/delivery-checkpoint-manifest@1'
  run: string
  basis: string
  inputs: { ref: string; sha256: string; bytes: number }[]
}
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const
export class DeliveryCheckpoints {
  readonly lifecycle: DeliveryLifecycle
  constructor(store?: string, now?: () => string) {
    this.lifecycle = new DeliveryLifecycle(store, now)
  }

  capture(run: string, value: unknown) {
    validateDeliveryShape(value, requestSchema)
    const request = value as CheckpointRequest
    this.paths(request.inputs)
    let digest = ''
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = view().get(run)
      if (!state) throw new DeliveryJournalError('unknown-run')
      const manifest: CheckpointManifest = {
        ...structuredClone(request),
        schema: 'wholeloop/delivery-checkpoint-manifest@1',
        run,
        basis: state.basis.digest,
        inputs: request.inputs.map((ref) => this.input(ref)),
      }
      validateDeliveryShape(manifest, manifestSchema)
      digest = contractDigest(manifest)
      const prior = deliveryCheckpoints(state).records.find(
        (record) => record.basis === manifest.basis && record.key === manifest.key,
      )
      if (prior) {
        if (prior.manifest !== digest) throw new DeliveryJournalError('changed-checkpoint')
        this.manifest(run, prior)
        return
      }
      const path = this.path(run, digest)
      const files = this.lifecycle.journal.files
      if (files.path(path) !== resolve(files.root, path))
        throw new DeliveryJournalError('aliased-checkpoint-path')
      const body = `${JSON.stringify(manifest, null, 2)}\n`
      if (existsSync(files.path(path))) {
        if (readSourceFile(files.root, path, 1024 * 1024) !== body)
          throw new DeliveryJournalError('changed-checkpoint-artifact')
      } else files.atomic(path, body)
      // An orphan immutable manifest is harmless; only this event makes it a retained checkpoint.
      append(run, {
        schema: 'wholeloop/delivery-checkpoint-event@1',
        basis: manifest.basis,
        key: manifest.key,
        stage: manifest.stage,
        manifest: digest,
        ...(manifest.attempt ? { attempt: manifest.attempt } : {}),
      })
    })
    return this.inspect(run).find((record) => record.digest === digest)
  }

  inspect(run: string) {
    const state = this.lifecycle.journal.view(run)
    return deliveryCheckpoints(state).records.map((record) => {
      const manifest = this.manifest(run, record)
      const problems: string[] = []
      if (record.basis !== state.basis.digest) problems.push('prior-plan-revision')
      for (const expected of manifest.inputs) {
        try {
          const current = this.input(expected.ref)
          if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes)
            problems.push('changed-input')
        } catch {
          problems.push('unavailable-input')
        }
      }
      return {
        key: record.key,
        digest: record.manifest,
        sequence: record.sequence,
        status: problems.length ? ('stale' as const) : ('current' as const),
        problems: [...new Set(problems)],
        manifest,
      }
    })
  }

  private manifest(run: string, record: Omit<CheckpointPayload, 'schema'>): CheckpointManifest {
    let value: unknown
    try {
      value = JSON.parse(
        readSourceFile(
          this.lifecycle.journal.files.root,
          this.path(run, record.manifest),
          1024 * 1024,
        ),
      )
    } catch {
      throw new DeliveryJournalError('unreadable-checkpoint-manifest')
    }
    validateDeliveryShape(value, manifestSchema)
    const manifest = value as CheckpointManifest
    if (
      contractDigest(value) !== record.manifest ||
      manifest.run !== run ||
      manifest.basis !== record.basis ||
      manifest.key !== record.key ||
      manifest.stage !== record.stage ||
      contractDigest(manifest.attempt ?? null) !== contractDigest(record.attempt ?? null)
    )
      throw new DeliveryJournalError('checkpoint-manifest-binding')
    this.paths(manifest.inputs.map((input) => input.ref))
    return manifest
  }
  private input(ref: string) {
    const bytes = readSourceBytes(this.lifecycle.journal.files.root, ref, 8 * 1024 * 1024)
    return { ref, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
  }
  private paths(refs: string[]): void {
    if (
      new Set(refs).size !== refs.length ||
      refs.some((ref) => ref.split('/').some((part) => part === '.' || part === '..' || !part))
    )
      throw new DeliveryJournalError('checkpoint-input-paths')
    const files = this.lifecycle.journal.files
    if (refs.some((ref) => files.path(ref) !== resolve(files.root, ref)))
      throw new DeliveryJournalError('aliased-checkpoint-input')
  }
  private path(run: string, digest: string): string {
    return `delivery/checkpoints/${run}/${digest}.json`
  }
}
