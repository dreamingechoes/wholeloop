import { watchOverview } from '../overview/watch.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

/** A terminal process owns cancellation only; it never owns a store writer lease. */
export async function watchCommand(
  parsed: { positional: string[]; options: Record<string, string | true> },
  root: string,
  io: Io,
) {
  if (parsed.positional.length) throw new CliError('watch takes no positional arguments')
  const abort = new AbortController(),
    cancel = () => {
      abort.abort()
      io.cancelOutput?.()
    }
  let outputError: { code?: string } | undefined
  const failed = (error: unknown) => {
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined
    outputError ??= code === undefined ? {} : { code }
    cancel()
  }
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  process.stdout.on('error', failed)
  try {
    const code = await watchOverview(
      {
        root,
        ...(typeof parsed.options['--since'] === 'string'
          ? { since: parsed.options['--since'] }
          : {}),
        poll: parsed.options['--poll'] === true,
        signal: abort.signal,
      },
      async (frame) => {
        if (outputError) throw outputError
        try {
          io.out(JSON.stringify(frame))
          await io.flush?.(abort.signal)
          if (outputError) throw outputError
        } catch (error) {
          // A sink can throw before stdout emits an error. Keep output failure
          // separate from store corruption and do not write another frame to it.
          if (!abort.signal.aborted) failed(error)
          throw error
        }
      },
    )
    return outputError && outputError.code !== 'EPIPE' ? EXIT.unexpected : code
  } catch {
    return outputError?.code === 'EPIPE' ? EXIT.ok : EXIT.unexpected
  } finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
    if (process.stdout.destroyed && !process.stdout.closed)
      process.stdout.once('close', () => process.stdout.removeListener('error', failed))
    else process.stdout.removeListener('error', failed)
  }
}
