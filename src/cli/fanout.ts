import { headlessAdapter } from '../fanout/adapters.js'
import { runHeadless } from '../fanout/run.js'
import { FlowEngine } from '../flow/engine.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { EXIT, type Io } from './io.js'

export async function fanoutCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const gate = positional[0]
  const subject = options['--for']
  const adapter = options['--adapter']
  if (
    positional.length !== 1 ||
    (gate !== 'verify' && gate !== 'review') ||
    typeof subject !== 'string' ||
    typeof adapter !== 'string' ||
    options['--engine'] !== 'headless'
  )
    throw new Error(
      'Use fanout run verify|review --for <id> --engine headless --adapter claude|codex',
    )
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    const result = await runHeadless(new FlowEngine(new StateStore(), root), subject, gate, {
      adapter: headlessAdapter(adapter),
      signal: controller.signal,
      ...(options['--concurrency'] !== undefined
        ? { concurrency: Number(options['--concurrency']) }
        : {}),
      ...(options['--timeout'] !== undefined
        ? { timeoutMs: Number(options['--timeout']) * 1000 }
        : {}),
    })
    io.out(JSON.stringify(result, null, json ? undefined : 2))
    return result.status === 'PASS' ? EXIT.ok : EXIT.shape
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
