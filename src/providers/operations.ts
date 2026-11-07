// Performs a provider operation through a host that owns tool calls, authentication and
// normalization.
import { createHash } from 'node:crypto'
import { isObject } from '../config/schema.js'
import type { LoadedProvider } from './load.js'
import { OPERATIONS } from './taxonomy.js'

export interface OperationCall {
  provider: string
  operation: string
  tool: string
  args: Record<string, unknown>
  guidance: string
}
export interface OperationResult {
  status: 'succeeded' | 'pending'
  ref: string
  body?: string
  revision?: string
  complete?: boolean
}
/** A host owns tool invocation, authentication and normalization of tool-specific responses. */
export interface ProviderHost {
  invoke(call: OperationCall): Promise<OperationResult>
  /** Explicit eligible remote binding; native-only fallbacks must not hide an available client tool. */
  supports?(call: OperationCall): boolean
}

function result(value: unknown): OperationResult {
  if (
    !isObject(value) ||
    !['succeeded', 'pending'].includes(String(value.status)) ||
    typeof value.ref !== 'string' ||
    !value.ref.trim() ||
    (value.body !== undefined && typeof value.body !== 'string') ||
    (value.revision !== undefined && typeof value.revision !== 'string') ||
    (value.complete !== undefined && typeof value.complete !== 'boolean')
  )
    throw new Error('Invalid normalized provider result; contents omitted')
  return {
    status: value.status as OperationResult['status'],
    ref: value.ref,
    ...(typeof value.body === 'string' ? { body: value.body } : {}),
    ...(typeof value.revision === 'string' ? { revision: value.revision } : {}),
    ...(typeof value.complete === 'boolean' ? { complete: value.complete } : {}),
  }
}

function call(
  provider: LoadedProvider,
  operation: string,
  input: Record<string, unknown>,
): OperationCall {
  const mapping = provider.manifest.operations[operation]
  if (!OPERATIONS.has(operation) || !mapping)
    throw new Error(`Provider does not support ${operation}`)
  function bind(value: unknown): unknown {
    if (typeof value === 'string') {
      const key = /^\{\{([a-zA-Z0-9_.-]+)\}\}$/.exec(value)?.[1]
      if (!key) return value
      if (!Object.hasOwn(input, key)) throw new Error(`Missing provider argument: ${key}`)
      return input[key]
    }
    if (Array.isArray(value)) return value.map(bind)
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, bind(child)]))
    return value
  }
  return {
    provider: provider.manifest.id,
    operation,
    tool: mapping.tool,
    args: { ...input, ...(bind(mapping.args ?? {}) as Record<string, unknown>) },
    guidance: provider.guidanceText[operation] ?? '',
  }
}

export async function performOperation(
  provider: LoadedProvider,
  operation: string,
  input: Record<string, unknown>,
  host: ProviderHost,
): Promise<OperationResult> {
  if (operation === 'docs.update')
    throw new Error('docs.update requires read-modify-write in the same operation')
  return result(await host.invoke(call(provider, operation, input)))
}

/** No caller-supplied read receipt can authorize a write; the read happens inside this invocation. */
export async function updateDocument(
  provider: LoadedProvider,
  ref: string,
  transform: (document: Readonly<{ body: string; revision: string }>) => string | Promise<string>,
  host: ProviderHost,
) {
  if (!ref.trim()) throw new Error('Provide the document reference')
  // Check write support before reading; bind write arguments only after the transform.
  if (!provider.manifest.operations['docs.update'])
    throw new Error('Provider does not support docs.update')
  const read = result(await host.invoke(call(provider, 'docs.read', { ref })))
  if (
    read.status !== 'succeeded' ||
    read.ref !== ref ||
    read.complete !== true ||
    typeof read.body !== 'string' ||
    !read.revision?.trim()
  )
    throw new Error(
      'A complete read of the same document with a revision is required before updating',
    )
  const body = await transform(Object.freeze({ body: read.body, revision: read.revision }))
  if (typeof body !== 'string') throw new Error('Document transform must return a body')
  const source = {
    ref,
    revision: read.revision,
    sha256: createHash('sha256').update(read.body).digest('hex'),
  }
  if (body === read.body)
    return { schema: 'wholeloop/document-update@1', changed: false, source, result: read }
  const written = result(
    await host.invoke(
      call(provider, 'docs.update', {
        ref,
        body,
        revision: read.revision,
        sourceSha256: source.sha256,
      }),
    ),
  )
  if (written.ref !== ref) throw new Error('Update response references a different document')
  return { schema: 'wholeloop/document-update@1', changed: true, source, result: written }
}
