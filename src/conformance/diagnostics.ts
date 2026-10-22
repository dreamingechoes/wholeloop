import { StringDecoder } from 'node:string_decoder'
import { isObject, validate } from '../config/schema.js'
import type { ConformanceContext, PreparedConformance } from './contracts.js'
import { readConformance, runFiles } from './prepare.js'
import schema from './schemas/diagnostics-v1.json' with { type: 'json' }

const events = new Set([
  'init',
  'step_update',
  'result',
  'step_start',
  'step_finish',
  'text',
  'tool_use',
  'tool_result',
  'error',
  'user.message',
  'assistant.turn_start',
  'assistant.message',
  'assistant.turn_end',
  'assistant.idle',
  'session.error',
  'tool.execution_start',
  'tool.execution_complete',
])
const patterns = {
  'authentication-required':
    /not authenticated|authentication required|not logged in|login required|invalid.*(?:api.?key|token)|unauthorized|\b401\b/i,
  'account-ineligible':
    /IneligibleTierError|ineligible|quota exceeded|billing|insufficient credits/i,
  'permission-denied':
    /permission denied|permission.*required|not allowed|access denied|not trusted|trust.*required/i,
  'invalid-invocation':
    /unknown (?:option|flag|agent)|agent not found|unrecognized (?:option|flag)|invalid argument|unexpected argument/i,
  'connection-failed':
    /ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|network.*(?:error|unavailable)|connection refused/i,
  'model-unavailable':
    /model not found|no model (?:configured|selected)|model.*(?:unavailable|not configured|not supported)/i,
} as const
export type NativeSignal = keyof typeof patterns

/** Inspect bounded bytes in memory; retain only closed categories, never native text, paths or payloads. */
export function nativeDiagnostics() {
  const state = { stdoutBytes: 0, stderrBytes: 0, oversizedLine: false, errorEvents: 0 }
  const observed = new Set<string>(),
    signals = new Set<NativeSignal>()
  const decode = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
  const carry = { stdout: '', stderr: '' }
  const dropping = { stdout: false, stderr: false }
  const classify = (text: string) => {
    for (const [name, pattern] of Object.entries(patterns))
      if (pattern.test(text)) signals.add(name as NativeSignal)
  }
  const line = (stream: 'stdout' | 'stderr', text: string) => {
    if (!text.trim()) return
    if (stream === 'stderr') {
      classify(text)
      return
    }
    try {
      const value: unknown = JSON.parse(text)
      if (!isObject(value)) return
      const name = value.event ?? value.type
      if (typeof name === 'string' && events.has(name)) observed.add(name)
      const result = isObject(value.result) ? value.result : undefined
      const data = isObject(value.data) ? value.data : undefined
      const step =
        name === 'step_update' && isObject(value.step_update) ? value.step_update : undefined
      const tool = step && isObject(step.tool_info) ? step.tool_info : undefined
      const nativeTool =
        name === 'tool_use' && isObject(value.part) && isObject(value.part.state)
          ? value.part.state
          : undefined
      // AGY soft-denies tools while the enclosing turn still reports SUCCESS and exits zero.
      const denied =
        name === 'result' &&
        Array.isArray(result?.denied_actions) &&
        result.denied_actions.length > 0
      if (denied) signals.add('permission-denied')
      if (
        name === 'error' ||
        name === 'session.error' ||
        result?.status === 'ERROR' ||
        data?.success === false ||
        (step?.state === 'ERROR' && tool?.error !== undefined) ||
        (nativeTool?.status === 'error' && nativeTool.error !== undefined) ||
        denied
      ) {
        state.errorEvents++
        const error =
          value.error ??
          result?.error ??
          data?.error ??
          data?.message ??
          tool?.error ??
          nativeTool?.error ??
          value.message ??
          ''
        // Provider failures can expose only an HTTP status, without a network exception string.
        if (
          isObject(error) &&
          typeof error.status === 'number' &&
          [502, 503, 504].includes(error.status)
        )
          signals.add('connection-failed')
        classify(JSON.stringify(error))
      }
    } catch {
      /* Non-JSON progress text is not an error or authority to classify a blocker. */
    }
  }
  return {
    observe(stream: 'stdout' | 'stderr', chunk: Buffer) {
      state[stream === 'stdout' ? 'stdoutBytes' : 'stderrBytes'] += chunk.length
      const text = decode[stream].write(chunk)
      for (const part of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
        const ended = part.endsWith('\n')
        if (!dropping[stream]) {
          carry[stream] += part
          if (Buffer.byteLength(carry[stream]) > 65536) {
            state.oversizedLine = true
            dropping[stream] = true
            carry[stream] = ''
          } else if (ended) {
            line(stream, carry[stream])
            carry[stream] = ''
          }
        }
        if (ended) dropping[stream] = false
      }
    },
    finish() {
      for (const stream of ['stdout', 'stderr'] as const) {
        carry[stream] += decode[stream].end()
        if (!dropping[stream] && carry[stream]) line(stream, carry[stream])
        carry[stream] = ''
      }
      return { ...state, events: [...observed].sort(), signals: [...signals].sort() }
    },
  }
}

const remedies: Record<NativeSignal, string> = {
  'authentication-required':
    'Authenticate through the native client credential store, then prepare a fresh run. Never copy a credential into a prompt or fixture.',
  'account-ineligible':
    'Review native account/project eligibility, allowance and billing before another live run.',
  'permission-denied':
    'Review the native permission/trust decision for the disposable fixture and exact checked launcher. Do not add blanket grants or bypass managed policy.',
  'invalid-invocation':
    'Compare the exact observed client version and its help with the selected recipe. Preserve this failed run and fix the invocation before retrying a fresh fixture.',
  'connection-failed':
    'Check native provider availability and network access, including upstream HTTP 502/503/504 responses. Do not switch providers or credentials automatically.',
  'model-unavailable':
    'Select an available model through the native client and its existing account; do not silently substitute one.',
}
function envelope(
  run: PreparedConformance,
  observations?: ReturnType<ReturnType<typeof nativeDiagnostics>['finish']>,
) {
  return {
    schema: 'wholeloop/conformance-diagnostics@1',
    id: run.id,
    target: run.target,
    core: run.core,
    phase: run.phase,
    mode: run.mode ?? 'unrun',
    status: observations ? 'observed' : 'unavailable',
    observations: observations ?? {
      stdoutBytes: 0,
      stderrBytes: 0,
      oversizedLine: false,
      errorEvents: 0,
      events: [],
      signals: [],
    },
    next: observations?.signals.length
      ? observations.signals.map((signal) => remedies[signal])
      : [
          'Inspect the scenario report and native client session. No recognized structured error establishes a cause; exit zero alone is not acceptance.',
        ],
    interpretation:
      'Categories summarize native error signals, not authenticated causes, permission grants or scenario acceptance.',
  }
}
export function saveNativeDiagnostics(
  context: ConformanceContext,
  run: PreparedConformance,
  observations: ReturnType<ReturnType<typeof nativeDiagnostics>['finish']>,
) {
  runFiles(context, run.id).atomic(
    'diagnostics.json',
    `${JSON.stringify(envelope(run, observations))}\n`,
  )
}
export function conformanceDiagnostics(context: ConformanceContext, id: string) {
  const run = readConformance(context, id)
  const raw = runFiles(context, id).read('diagnostics.json')
  if (raw === undefined) return envelope(run)
  try {
    if (Buffer.byteLength(raw) > 65536) throw new Error()
    const value: unknown = JSON.parse(raw)
    if (
      validate(value, schema).length ||
      !isObject(value) ||
      value.id !== run.id ||
      value.core !== run.core ||
      value.target !== run.target ||
      value.phase !== run.phase ||
      value.mode !== run.mode
    )
      throw new Error()
    return value
  } catch {
    throw new Error('Invalid conformance diagnostics; preserve the file and inspect the exact run')
  }
}
