// `wl launch draft`: drafts a planned launch kit in one isolated headless worker.
import { openCodeVersionProbe } from '../diagnostics/doctor.js'
import { headlessAdapter } from '../fanout/adapters.js'
import { FlowEngine } from '../flow/engine.js'
import { draftHeadless } from '../launch/headless.js'
import { LaunchWorkflow } from '../launch/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export async function launchDraftCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const subject = options['--for']
  const adapter = options['--adapter']
  if (
    positional.length ||
    typeof subject !== 'string' ||
    typeof adapter !== 'string' ||
    options['--engine'] !== 'headless'
  )
    throw new CliError(
      'Use launch draft --for <id> --engine headless --adapter <client>',
      EXIT.input,
    )
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    const observed = adapter === 'opencode' ? openCodeVersionProbe(process.env, root) : undefined
    if (observed && (observed.status !== 'observed' || !observed.version))
      throw new Error('Observe the native OpenCode version before selecting a headless dialect')
    const result = await draftHeadless(
      new LaunchWorkflow(new FlowEngine(new StateStore(), root)),
      subject,
      {
        adapter: headlessAdapter(adapter, observed?.version),
        signal: controller.signal,
        ...(options['--timeout'] !== undefined
          ? { timeoutMs: Number(options['--timeout']) * 1000 }
          : {}),
      },
    )
    io.out(JSON.stringify(result, null, json ? undefined : 2))
    return result.status === 'stopped' ? EXIT.shape : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Headless launch drafting failed',
      EXIT.precondition,
    )
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
