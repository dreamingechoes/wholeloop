import type { LoadedProvider } from '../providers/load.js'
import {
  type OperationCall,
  type OperationResult,
  type ProviderHost,
  performOperation,
} from '../providers/operations.js'
import { canonicalSharedUrl } from '../sharing/contracts.js'
import {
  type SourceAttachment,
  SourceInputError,
  type SourceObservation,
  sourceRequest,
} from './input.js'

/** The client normalizer must obtain scope from the observed response, never the requested URL. */
export interface SourceProviderHost extends ProviderHost {
  invoke(call: OperationCall): Promise<
    OperationResult & {
      scope: string
      attachments: SourceAttachment[]
    }
  >
}

export async function readProviderSource(
  value: unknown,
  provider: LoadedProvider,
  host: SourceProviderHost,
): Promise<SourceObservation> {
  const request = sourceRequest(value)
  if (
    !['tracker', 'document'].includes(request.kind) ||
    request.observation !== undefined ||
    request.provider !== provider.manifest.id
  )
    throw new SourceInputError('invalid-input')
  let ref: string
  try {
    ref = canonicalSharedUrl(request.ref)
  } catch {
    throw new SourceInputError('invalid-input')
  }
  let scope: string | undefined,
    attachments: SourceAttachment[] = []
  let read: OperationResult
  try {
    read = await performOperation(
      provider,
      request.kind === 'tracker' ? 'tracker.read-item' : 'docs.read',
      { ref },
      {
        async invoke(call) {
          if (host.supports && !host.supports(call)) throw new SourceInputError('unavailable')
          const result = await host.invoke(call)
          scope = result.scope
          attachments = result.attachments
          return result
        },
      },
    )
  } catch {
    throw new SourceInputError('unavailable')
  }
  return {
    schema: 'wholeloop/delivery-source-observation@1',
    provider: provider.manifest.id,
    scope: scope ?? '',
    ...read,
    complete: read.complete === true,
    attachments,
  }
}
