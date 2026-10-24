import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contractDigest } from '../contracts/compatibility.js'
import type { LoadedProvider } from '../providers/load.js'
import { canonicalSharedUrl } from '../sharing/contracts.js'
import { ITEM_ID } from '../state/events.js'
import { StoreFiles } from '../state/files.js'
import { storePath } from '../state/paths.js'
import { StateStore } from '../state/store.js'
import {
  readSourceFile,
  SourceInputError,
  type SourceMapping,
  type SourceObservation,
  type SourceRequest,
  safeSourceText,
  sourceHash,
  sourceRequest,
  validateSourceMapping,
  validateSourceShape,
} from './input.js'
import observationSchema from './schemas/source-observation-v1.json' with { type: 'json' }
import snapshotSchema from './schemas/source-snapshot-v1.json' with { type: 'json' }
import { readProviderSource, type SourceProviderHost } from './source-host.js'

export interface SourceSnapshot {
  schema: 'wholeloop/delivery-source-snapshot@1'
  id: string
  kind: SourceRequest['kind']
  ref: string
  provider: string
  scope: string
  revision: string
  sha256: string
  fetchedAt: string
  origin: 'local' | 'import' | 'host'
  body: string
  mapping: SourceMapping[]
  attachments: SourceObservation['attachments']
}

function identity(snapshot: Omit<SourceSnapshot, 'id'>): string {
  const { fetchedAt: _fetchedAt, ...binding } = snapshot
  return contractDigest(binding)
}

export function remoteSourceRef(ref: string): string {
  try {
    return canonicalSharedUrl(ref)
  } catch {
    throw new SourceInputError('invalid-input')
  }
}

export function remoteSourceObservation(request: SourceRequest, value: unknown): SourceObservation {
  validateSourceShape(value, observationSchema)
  const read = structuredClone(value) as SourceObservation
  safeSourceText(JSON.stringify(read), 8 * 1024 * 1024)
  if (
    read.provider !== request.provider ||
    read.scope !== request.scope ||
    remoteSourceRef(read.ref) !== remoteSourceRef(request.ref)
  )
    throw new SourceInputError('scope-mismatch')
  if (read.status !== 'succeeded' || !read.complete || !read.body?.trim() || !read.revision?.trim())
    throw new SourceInputError('incomplete-read')
  if (read.revision.length > 4096 || read.attachments.length > 100)
    throw new SourceInputError('oversized')
  safeSourceText(read.body)
  const refs = read.attachments.map((attachment) => remoteSourceRef(attachment.ref))
  if (new Set(refs).size !== refs.length) throw new SourceInputError('invalid-input')
  read.attachments = read.attachments.map((attachment, index) => ({
    ...attachment,
    ref: refs[index] ?? '',
  }))
  return read
}

/** Snapshots are separate immutable inputs; intake creates no item, decision, grant or worker. */
export class DeliverySources {
  readonly files: StoreFiles
  constructor(store = storePath()) {
    this.files = new StoreFiles(store)
  }

  capture(value: unknown, root: string, now = new Date().toISOString()): SourceSnapshot {
    const request = sourceRequest(value)
    return this.prepare(request, root, now, 'import', request.observation)
  }

  /** Only a host read made in this call may acquire host provenance. */
  async captureFromHost(
    value: unknown,
    root: string,
    provider: LoadedProvider,
    host: SourceProviderHost,
  ): Promise<SourceSnapshot> {
    const request = sourceRequest(value)
    if (request.observation !== undefined || !['tracker', 'document'].includes(request.kind))
      throw new SourceInputError('invalid-input')
    const observation = await readProviderSource(request, provider, host)
    return this.prepare(request, root, new Date().toISOString(), 'host', observation)
  }

  private prepare(
    request: SourceRequest,
    root: string,
    fetchedAt: string,
    origin: 'import' | 'host',
    observation?: SourceObservation,
  ): SourceSnapshot {
    if (!Number.isFinite(Date.parse(fetchedAt)) || new Date(fetchedAt).toISOString() !== fetchedAt)
      throw new SourceInputError('invalid-input')
    let body: string, ref: string, revision: string
    let provider = 'local',
      scope = realpathSync(root)
    let attachments: SourceObservation['attachments'] = []
    if (request.kind === 'tracker' || request.kind === 'document') {
      if (observation === undefined) throw new SourceInputError('unavailable')
      const read = remoteSourceObservation(request, observation)
      body = read.body ?? ''
      revision = read.revision ?? ''
      ref = remoteSourceRef(read.ref)
      provider = read.provider
      scope = read.scope
      attachments = read.attachments
    } else {
      origin = 'import'
      if (request.kind === 'inline') {
        body = request.body ?? ''
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(request.ref))
          throw new SourceInputError('invalid-input')
        ref = `inline:${request.ref}`
      } else if (request.kind === 'file') {
        body = readSourceFile(scope, request.ref)
        ref = pathToFileURL(realpathSync(resolve(scope, request.ref))).href
      } else {
        if (!ITEM_ID.test(request.ref)) throw new SourceInputError('invalid-input')
        let item: ReturnType<StateStore['get']>
        try {
          item = new StateStore(this.files.root).get(request.ref)
        } catch {
          throw new SourceInputError('unavailable')
        }
        if (item.repository !== undefined && realpathSync(item.repository) !== scope)
          throw new SourceInputError('scope-mismatch')
        body = `${item.title}\n\n${item.body}`
        ref = `wholeloop:${item.id}`
        provider = 'wholeloop'
        // Item IDs are only unique inside their store; preserve that provenance.
        scope = this.files.root
      }
      revision = sourceHash(body)
    }
    safeSourceText(body)
    if (!body.trim()) throw new SourceInputError('invalid-input')
    validateSourceMapping(body, request.mapping)
    const snapshot: Omit<SourceSnapshot, 'id'> = {
      schema: 'wholeloop/delivery-source-snapshot@1',
      kind: request.kind,
      ref,
      provider,
      scope,
      revision,
      sha256: sourceHash(body),
      fetchedAt,
      origin: ['tracker', 'document'].includes(request.kind) ? origin : 'local',
      body,
      mapping: request.mapping,
      attachments,
    }
    // Schema and non-secret metadata are checked before acquiring a write lock.
    const result = { ...snapshot, id: identity(snapshot) }
    this.validate(result)
    return this.files.locked(() => {
      if (existsSync(this.files.path(this.path(result.id)))) return this.get(result.id)
      this.files.atomic(this.path(result.id), `${JSON.stringify(result)}\n`)
      return structuredClone(result)
    })
  }

  get(id: string): SourceSnapshot {
    const path = this.path(id)
    let value: unknown
    try {
      value = JSON.parse(readSourceFile(this.files.root, path, 8 * 1024 * 1024))
    } catch {
      throw new Error('Missing or damaged delivery source snapshot; contents omitted')
    }
    const snapshot = this.validate(value)
    if (snapshot.id !== id) throw new Error('Delivery source identity mismatch; contents omitted')
    return snapshot
  }

  private path(id: string): string {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new SourceInputError('invalid-input')
    return `delivery/sources/${id}.json`
  }

  private validate(value: unknown): SourceSnapshot {
    validateSourceShape(value, snapshotSchema)
    const snapshot = value as SourceSnapshot
    safeSourceText(JSON.stringify(snapshot), 8 * 1024 * 1024)
    safeSourceText(snapshot.body)
    validateSourceMapping(snapshot.body, snapshot.mapping)
    const { id, ...binding } = snapshot
    if (sourceHash(snapshot.body) !== snapshot.sha256 || identity(binding) !== id)
      throw new Error('Delivery source digest mismatch; contents omitted')
    return structuredClone(snapshot)
  }
}
