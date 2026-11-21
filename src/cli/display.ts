// Formats native completion observations without reading a store or creating progress state.
import { progressText, renderDisplay } from '../display/render.js'
import { STEP_LABELS } from '../display/step.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function displayCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
) {
  const step = String(options['--step'] ?? '')
  const label = String(options['--worker'] ?? '')
  const elapsedMs = Number(options['--elapsed-ms'])
  const status = String(options['--status'] ?? 'finished')
  if (
    positional.length ||
    !Object.hasOwn(STEP_LABELS, step) ||
    label.length > 160 ||
    !['running', 'finished', 'failed', 'unavailable'].includes(status)
  )
    throw new CliError('Provide --step, --worker and an observed --elapsed-ms; use a known status')
  const progress = {
    label,
    elapsedMs,
    status: status as 'running' | 'finished' | 'failed' | 'unavailable',
  }
  let text: string
  try {
    text = progressText(progress)
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : 'Invalid progress')
  }
  const display = renderDisplay({
    header: '',
    rows: [],
    progress: [progress],
    produced: [],
    open: [],
    next: [],
  })
  io.out(
    json
      ? JSON.stringify({ schema: 'wholeloop/display-progress@1', progress, display, text })
      : text,
  )
  return EXIT.ok
}
