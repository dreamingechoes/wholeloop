// Publishes queued shared documents after a step completes, outside the store lock.
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import type { FlowEngine } from '../flow/engine.js'
import { measurementDigest } from '../launch/measurement.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import {
  type OperationResult,
  type ProviderHost,
  performOperation,
  updateDocument,
} from '../providers/operations.js'
import { itemId } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import {
  canonicalSharedUrl,
  linkedSharedItem,
  queueSharedArtifacts,
  type SharedTarget,
  sharedChunk,
  sharingState,
  validSharingData,
} from './contracts.js'

function trackerBody(content: string) {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('Invalid normalized tracker document; contents omitted')
  }
  if (!isObject(value) || typeof value.body !== 'string')
    throw new Error('Normalize the complete tracker body')
  return value
}

export class SharingWorkflow {
  constructor(readonly engine: FlowEngine) {}
  importRead(
    ref: string,
    read: OperationResult,
    options: { provider: string; kind: 'docs' | 'tracker'; owner?: string; title?: string },
    origin: 'host' | 'import' = 'import',
  ) {
    const url = canonicalSharedUrl(ref)
    const existing = linkedSharedItem(this.engine.store.events(), url)
    if (existing)
      return {
        schema: 'wholeloop/adopt@1',
        status: 'adopted' as const,
        subject: existing,
        cached: true,
        questions: [],
      }
    if (!options.provider.trim() || !['docs', 'tracker'].includes(options.kind))
      throw new Error('Confirm the document/item provider and kind')
    this.provider(options.provider, options.kind === 'docs' ? 'docs.read' : 'tracker.read-item')
    if (
      read.status !== 'succeeded' ||
      !read.complete ||
      !read.revision?.trim() ||
      canonicalSharedUrl(read.ref) !== url ||
      !read.body?.trim() ||
      Buffer.byteLength(read.body) > 1024 * 1024
    )
      throw new Error('Adoption needs a complete matching revision-bound read under 1 MiB')
    let content = read.body
    let title = options.title
    let owner = options.owner
    if (options.kind === 'tracker') {
      const value = trackerBody(content)
      if (!isObject(value) || typeof value.body !== 'string' || typeof value.title !== 'string')
        throw new Error('Normalize tracker adoption to title/body and optional owner')
      content = value.body
      title ??= value.title
      owner ??= typeof value.owner === 'string' ? value.owner : undefined
    } else title ??= /^#\s+(.+)$/m.exec(content)?.[1]
    const questions = []
    if (!owner?.trim()) questions.push({ id: 'owner', prompt: 'Who owns the adopted initiative?' })
    if (!title?.trim())
      questions.push({ id: 'title', prompt: 'What title identifies this shared work?' })
    if (questions.length)
      return { schema: 'wholeloop/adopt@1', status: 'question' as const, questions }
    const subject = this.engine.store.transaction((events, append) => {
      const prior = linkedSharedItem(events, url)
      if (prior) return prior
      let id = itemId('initiative')
      while (sharingState(events).items.has(id)) id = itemId('initiative')
      append(id, {
        type: 'item.created',
        data: {
          kind: 'initiative',
          title: title ?? '',
          owner: owner ?? '',
          repository: canonicalPath(this.engine.root),
          body: `# Adopted source\n\nSource: ${url}; revision ${read.revision}. Imported context only; no prior approval or Define completion is implied.\n\n${content}`,
        },
      })
      append(id, {
        type: 'share.adopted',
        data: {
          ref: url,
          provider: options.provider,
          kind: options.kind,
          revision: read.revision ?? '',
          digest: measurementDigest(read.body),
          origin,
        },
      })
      append(id, { type: 'link.added', data: { url } })
      return id
    })
    return {
      schema: 'wholeloop/adopt@1',
      status: 'adopted' as const,
      subject,
      cached: false,
      questions: [],
    }
  }
  async adopt(
    ref: string,
    options: { provider: string; kind: 'docs' | 'tracker'; owner?: string; title?: string },
    host: ProviderHost,
  ) {
    const existing = linkedSharedItem(this.engine.store.events(), ref)
    if (existing)
      return {
        schema: 'wholeloop/adopt@1',
        status: 'adopted' as const,
        subject: existing,
        cached: true,
        questions: [],
      }
    if (!['docs', 'tracker'].includes(options.kind))
      throw new Error('Choose docs or tracker adoption')
    const provider = this.provider(
      options.provider,
      `${options.kind}.${options.kind === 'docs' ? 'read' : 'read-item'}`,
    )
    const read = await performOperation(
      provider,
      options.kind === 'docs' ? 'docs.read' : 'tracker.read-item',
      { ref: canonicalSharedUrl(ref) },
      host,
    )
    return this.importRead(ref, read, options, 'host')
  }
  private provider(id: string, operation: string) {
    const registry = loadProviders(
      loadExtensionOptions({ root: this.engine.root, userFile: this.engine.userFile }),
    )
    if (registry.problems.length) throw new Error('Resolve provider problems before shared work')
    return resolveProvider(registry, operation, id)
  }
  async mode(
    initiative: string,
    mode: 'local' | 'shared',
    by: string,
    targets: SharedTarget[],
    host?: ProviderHost,
  ) {
    this.setMode(initiative, mode, by, targets)
    return host && mode === 'shared' ? this.flush(initiative, host) : this.report(initiative)
  }
  setMode(initiative: string, mode: 'local' | 'shared', by: string, targets: SharedTarget[]) {
    const item = this.engine.store.get(initiative)
    if (item.kind !== 'initiative')
      throw new Error('Choose an initiative for its local/shared work mode')
    const normalized = targets.map((target) => ({
      ...target,
      ...(target.ref ? { ref: canonicalSharedUrl(target.ref) } : {}),
    }))
    if (!validSharingData('share.mode', { mode, by, targets: normalized }))
      throw new Error('Provide a named person, local/shared mode and unique valid shared targets')
    for (const target of normalized)
      this.provider(
        target.provider,
        target.kind === 'docs'
          ? target.ref
            ? 'docs.update'
            : 'docs.create'
          : target.ref
            ? 'tracker.update-item'
            : 'tracker.create-item',
      )
    this.engine.store.transaction((events, append) => {
      const prior = sharingState(events).modes.get(initiative)
      const value = { mode, by, targets: normalized }
      if (!prior || measurementDigest(prior) !== measurementDigest(value))
        append(initiative, { type: 'share.mode', data: value })
      queueSharedArtifacts(events, append, initiative)
    })
    return this.report(initiative)
  }
  report(initiative: string) {
    this.engine.store.get(initiative)
    const state = sharingState(this.engine.store.events())
    return {
      schema: 'wholeloop/share-report@1',
      initiative,
      mode: state.modes.get(initiative)?.mode ?? 'local',
      targets: state.modes.get(initiative)?.targets ?? [],
      publications: [...state.queue]
        .filter(([, entry]) => entry.root === initiative)
        .map(([key, entry]) => ({
          key,
          ...entry,
          status: entry.ref ? 'published' : entry.requested ? 'ambiguous' : 'queued',
        })),
    }
  }
  /** Invoke after completion; the core transaction only persists the outbox. */
  async complete(name: string, subject: string, content: string, host: ProviderHost) {
    const result = this.engine.complete(name, subject, content)
    const root = sharingState(this.engine.store.events()).root(subject)
    return {
      completion: result,
      sharing:
        root && this.report(root).mode === 'shared'
          ? await this.flush(root, host)
          : root
            ? this.report(root)
            : null,
    }
  }
  requests(initiative: string) {
    return {
      ...this.report(initiative),
      publications: this.report(initiative).publications.map((entry) => ({
        ...entry,
        ...(!entry.ref && !entry.requested
          ? { chunk: sharedChunk(this.engine.store.events(), entry.artifact).content }
          : {}),
        operation:
          entry.target.kind === 'docs'
            ? entry.target.ref
              ? 'docs.update'
              : 'docs.create'
            : entry.target.ref
              ? 'tracker.update-item'
              : 'tracker.create-item',
      })),
    }
  }
  request(initiative: string, key: string) {
    const entry = this.requests(initiative).publications.find((entry) => entry.key === key)
    if (!entry) throw new Error('Choose an exact shared outbox key')
    if (entry.ref || entry.requested)
      return {
        schema: 'wholeloop/share-request@1',
        status: entry.ref ? 'published' : 'ambiguous',
        key,
        ref: entry.ref ?? entry.target.ref,
        action: 'Read and reconcile; do not repeat a write.',
        request: null,
      }
    this.provider(entry.target.provider, entry.operation)
    this.engine.store.transaction((_events, append) =>
      append(initiative, { type: 'share.requested', data: { key } }),
    )
    return {
      schema: 'wholeloop/share-request@1',
      status: 'authorized',
      key,
      request: {
        provider: entry.target.provider,
        operation: entry.operation,
        target: entry.target,
        title: `${sharedChunk(this.engine.store.events(), entry.artifact).event.data.step}: ${this.engine.store.get(entry.subject).title}`,
        chunk: entry.chunk,
        readModifyWrite: Boolean(entry.target.ref),
        instructions:
          'For an existing target fetch its complete current revision in this operation, append the exact chunk only if its marker is absent, preserve unrelated content, then conditionally write that revision. For a new target create once. Read the resulting complete artifact and reconcile; a lost response never authorizes retry.',
      },
    }
  }
  async flush(initiative: string, host: ProviderHost) {
    if (this.report(initiative).mode !== 'shared')
      throw new Error('Switch to shared explicitly before publication')
    for (const entry of this.report(initiative).publications) {
      if (entry.ref || entry.requested) continue
      const chunk = sharedChunk(this.engine.store.events(), entry.artifact)
      const target = entry.target
      const operation =
        target.kind === 'docs'
          ? target.ref
            ? 'docs.update'
            : 'docs.create'
          : target.ref
            ? 'tracker.update-item'
            : 'tracker.create-item'
      const provider = this.provider(target.provider, operation)
      const authorized = this.request(initiative, entry.key)
      if (authorized.status !== 'authorized') continue
      try {
        let result: OperationResult
        if (operation === 'docs.update')
          result = (
            await updateDocument(
              provider,
              target.ref ?? '',
              ({ body }) => (body.includes(chunk.marker) ? body : `${body}\n\n${chunk.content}`),
              host,
            )
          ).result
        else if (operation === 'tracker.update-item') {
          const read = await performOperation(
            provider,
            'tracker.read-item',
            { ref: target.ref },
            host,
          )
          if (
            read.status !== 'succeeded' ||
            !read.complete ||
            read.ref !== target.ref ||
            !read.revision ||
            !read.body
          )
            throw new Error('No complete tracker body')
          const parsed = trackerBody(read.body)
          if (!isObject(parsed) || typeof parsed.body !== 'string')
            throw new Error('Normalize the existing tracker body')
          result = parsed.body.includes(chunk.marker)
            ? read
            : await performOperation(
                provider,
                operation,
                {
                  ref: target.ref,
                  body: `${parsed.body}\n\n${chunk.content}`,
                  revision: read.revision,
                },
                host,
              )
        } else
          result = await performOperation(
            provider,
            operation,
            {
              title: `${chunk.event.data.step}: ${this.engine.store.get(entry.subject).title}`,
              body: chunk.content,
            },
            host,
          )
        if (result.status === 'succeeded')
          await this.reconcile(initiative, entry.key, result.ref, host)
      } catch {
        /* Retain intent: a failed response does not establish that no remote effect occurred. */
      }
    }
    return this.report(initiative)
  }
  async reconcile(
    initiative: string,
    key: string,
    ref: string,
    host: ProviderHost,
    origin: 'host' | 'import' = 'host',
  ) {
    const entry = this.report(initiative).publications.find((entry) => entry.key === key)
    if (!entry?.requested) throw new Error('Reconcile a retained publication intent')
    if (entry.ref) return this.report(initiative)
    const url = canonicalSharedUrl(ref)
    if (entry.target.ref && url !== entry.target.ref)
      throw new Error('Existing-target publication must retain its exact reference')
    const provider = this.provider(
      entry.target.provider,
      entry.target.kind === 'docs' ? 'docs.read' : 'tracker.read-item',
    )
    const read = await performOperation(
      provider,
      entry.target.kind === 'docs' ? 'docs.read' : 'tracker.read-item',
      { ref: url },
      host,
    )
    if (!read.body || Buffer.byteLength(read.body) > 1024 * 1024)
      throw new Error('Reconciliation needs a bounded complete document body')
    if (
      read.status !== 'succeeded' ||
      !read.complete ||
      !read.revision?.trim() ||
      canonicalSharedUrl(read.ref) !== url
    )
      throw new Error('Require a complete same-reference revision-bound publication read')
    let body = read.body
    if (entry.target.kind === 'tracker') {
      const parsed = trackerBody(body)
      if (!isObject(parsed) || typeof parsed.body !== 'string')
        throw new Error('No normalized tracker publication body')
      body = parsed.body
    }
    const chunk = sharedChunk(this.engine.store.events(), entry.artifact)
    if (
      read.status !== 'succeeded' ||
      !read.complete ||
      !read.revision ||
      canonicalSharedUrl(read.ref) !== url ||
      !body.includes(chunk.content)
    )
      throw new Error(
        'Observe the complete same-reference artifact content before recording publication',
      )
    this.engine.store.transaction((events, append) => {
      if (!sharingState(events).queue.get(key)?.ref) {
        append(initiative, { type: 'share.published', data: { key, ref: url, origin } })
        append(entry.subject, { type: 'link.added', data: { url } })
        if (entry.subject !== initiative) append(initiative, { type: 'link.added', data: { url } })
      }
    })
    return this.report(initiative)
  }
}
