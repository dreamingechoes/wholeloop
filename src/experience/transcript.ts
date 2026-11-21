// Normalizes reference-client transcripts without mistaking tool output for text shown to a person.
// Unknown event shapes remain visible diagnostics rather than invented zero-cost observations.
export type ExperienceClient = 'codex' | 'claude'
export interface ObservedEvent {
  atMs: number
  event: Record<string, unknown>
}
export interface ExperienceTrace {
  schema: 'wholeloop/experience-trace@1'
  provenance: 'synthetic' | 'live'
  client: ExperienceClient
  step: string
  wallMs: number
  exitCode: number | null
  chosenSources: string[]
  requiredQuestions: string[]
  events: ObservedEvent[]
}
export interface TextObservation {
  atMs: number
  text: string
}
export interface WorkerObservation {
  id: string
  startedMs: number
  finishedMs: number | null
}
export interface ParsedTranscript {
  text: TextObservation[]
  finalText: string | null
  tools: { atMs: number; name: string; input: Record<string, unknown> }[]
  workers: WorkerObservation[]
  tokens: { input: number; output: number; cached: number } | null
  approvals: number
  diagnostics: string[]
}

export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function experienceTrace(value: unknown): ExperienceTrace {
  if (
    !object(value) ||
    value.schema !== 'wholeloop/experience-trace@1' ||
    !['synthetic', 'live'].includes(String(value.provenance)) ||
    !['codex', 'claude'].includes(String(value.client)) ||
    typeof value.step !== 'string' ||
    !Number.isFinite(value.wallMs) ||
    Number(value.wallMs) < 0 ||
    !(value.exitCode === null || Number.isInteger(value.exitCode)) ||
    !Array.isArray(value.chosenSources) ||
    !value.chosenSources.every((source) => typeof source === 'string') ||
    !Array.isArray(value.requiredQuestions) ||
    !value.requiredQuestions.every((question) => typeof question === 'string') ||
    !Array.isArray(value.events)
  )
    throw new Error('Invalid experience trace')
  let previous = 0
  for (const observed of value.events) {
    if (
      !object(observed) ||
      typeof observed.atMs !== 'number' ||
      !Number.isFinite(observed.atMs) ||
      observed.atMs < previous ||
      observed.atMs > Number(value.wallMs) ||
      !object(observed.event)
    )
      throw new Error('Invalid or unordered experience event')
    previous = observed.atMs
  }
  return value as unknown as ExperienceTrace
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

export function parseTranscript(trace: ExperienceTrace): ParsedTranscript {
  const result: ParsedTranscript = {
    text: [],
    finalText: null,
    tools: [],
    workers: [],
    tokens: null,
    approvals: 0,
    diagnostics: [],
  }
  const messages = new Set<string>(),
    tools = new Set<string>()
  const pendingWorkers = new Map<string, WorkerObservation>()
  const backgroundWorkers = new Set<string>()
  let ended = false
  for (const { atMs, event } of trace.events) {
    if (trace.client === 'codex') {
      if (event.type === 'turn.completed' && object(event.usage)) {
        addUsage(event.usage, false)
        ended = true
      } else if (event.type === 'turn.failed' || event.type === 'error') {
        result.diagnostics.push('Client reported a failed turn')
      } else if (object(event.item)) {
        const item = event.item,
          id = String(item.id)
        if (item.type === 'agent_message' && event.type === 'item.completed') {
          if (typeof item.text === 'string' && !messages.has(id)) {
            result.text.push({ atMs, text: item.text })
            result.finalText = item.text
            messages.add(id)
          }
        } else if (
          [
            'command_execution',
            'mcp_tool_call',
            'collab_tool_call',
            'web_search',
            'file_change',
          ].includes(String(item.type))
        ) {
          if (!tools.has(id)) {
            const name =
              item.type === 'mcp_tool_call'
                ? `${item.server}.${item.tool}`
                : String(item.tool ?? item.type)
            result.tools.push({ atMs, name, input: item })
            tools.add(id)
          }
          if (item.type === 'collab_tool_call' && item.tool === 'spawn_agent') {
            startWorker(id, atMs)
            // Launch completion is not worker completion. Only an observed status ends its interval.
            if (Array.isArray(item.receiver_thread_ids)) {
              const worker = pendingWorkers.get(id)
              if (worker)
                for (const receiver of item.receiver_thread_ids)
                  pendingWorkers.set(String(receiver), worker)
            }
          }
          if (item.type === 'collab_tool_call' && object(item.agents_states))
            for (const [worker, state] of Object.entries(item.agents_states))
              if (
                object(state) &&
                ['completed', 'errored', 'shutdown'].includes(String(state.status))
              )
                endWorker(worker, atMs)
        } else if (item.type !== 'reasoning')
          result.diagnostics.push(`Unsupported Codex item: ${String(item.type)}`)
      } else if (event.type === 'approval.requested') result.approvals++
      else if (!['thread.started', 'turn.started'].includes(String(event.type)))
        result.diagnostics.push(`Unsupported Codex event: ${String(event.type)}`)
    } else {
      if (
        event.type === 'assistant' &&
        object(event.message) &&
        Array.isArray(event.message.content)
      ) {
        const id = String(event.message.id)
        if (messages.has(id)) continue
        messages.add(id)
        for (const block of event.message.content) {
          if (!object(block)) continue
          if (block.type === 'text' && typeof block.text === 'string')
            result.text.push({ atMs, text: block.text })
          if (block.type === 'tool_use' && typeof block.name === 'string' && object(block.input)) {
            result.tools.push({ atMs, name: block.name, input: block.input })
            if (['Task', 'Agent'].includes(block.name)) {
              startWorker(String(block.id), atMs)
              if (block.input.run_in_background === true) backgroundWorkers.add(String(block.id))
            }
          }
        }
      } else if (
        event.type === 'user' &&
        object(event.message) &&
        Array.isArray(event.message.content)
      ) {
        for (const block of event.message.content)
          if (
            object(block) &&
            block.type === 'tool_result' &&
            !backgroundWorkers.has(String(block.tool_use_id))
          )
            endWorker(String(block.tool_use_id), atMs)
      } else if (event.type === 'result') {
        ended = true
        if (typeof event.result === 'string') result.finalText = event.result
        if (object(event.usage)) addUsage(event.usage, true)
        if (Array.isArray(event.permission_denials))
          result.approvals = Math.max(result.approvals, event.permission_denials.length)
        if (event.is_error === true) result.diagnostics.push('Client reported a failed result')
      } else if (event.type === 'permission_request') result.approvals++
      // Partial text deltas duplicate complete messages; system messages are not person-facing.
      else if (!['system', 'stream_event', 'rate_limit_event'].includes(String(event.type)))
        result.diagnostics.push(`Unsupported Claude event: ${String(event.type)}`)
    }
  }
  if (!ended) result.diagnostics.push('No completed client result')
  if (result.finalText && !result.text.some((part) => part.text === result.finalText))
    result.text.push({ atMs: trace.wallMs, text: result.finalText })
  if (result.workers.some((worker) => worker.finishedMs === null))
    result.diagnostics.push('Worker completion not observed')
  return result

  function startWorker(id: string, atMs: number) {
    if (pendingWorkers.has(id)) return
    const worker = { id, startedMs: atMs, finishedMs: null }
    pendingWorkers.set(id, worker)
    result.workers.push(worker)
  }
  function endWorker(id: string, atMs: number) {
    const worker = pendingWorkers.get(id)
    if (worker) worker.finishedMs = atMs
  }
  function addUsage(usage: Record<string, unknown>, replace: boolean) {
    const input = count(usage.input_tokens),
      output = count(usage.output_tokens)
    const cached = count(usage.cached_input_tokens ?? usage.cache_read_input_tokens ?? 0)
    const created = count(usage.cache_creation_input_tokens ?? 0)
    if (input === null || output === null || cached === null || created === null) {
      result.diagnostics.push('Invalid client token usage')
      return
    }
    const before = replace ? null : result.tokens
    result.tokens = {
      input: (before?.input ?? 0) + input + (trace.client === 'claude' ? cached + created : 0),
      output: (before?.output ?? 0) + output,
      cached: (before?.cached ?? 0) + cached,
    }
  }
}
