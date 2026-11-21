// Measures observed experience separately from acceptance policy, keeping missing evidence explicit.
import { bannedTerms } from '../display/terms.js'
import { type ExperienceTrace, parseTranscript } from './transcript.js'

export function experienceReport(trace: ExperienceTrace) {
  const parsed = parseTranscript(trace),
    text = parsed.text.map((part) => part.text).join('\n')
  const sources = new Set<string>(),
    commands: string[] = []
  for (const tool of parsed.tools) {
    const command = tool.input.command ?? tool.input.cmd
    if (typeof command === 'string') commands.push(command)
    const value = `${tool.name} ${typeof command === 'string' ? command : ''}`.toLowerCase()
    for (const [source, pattern] of Object.entries({
      web: /web_search|web[._]|webfetch|websearch|curl\b|wget\b/,
      codebase: /read_file|readfile|\b(?:read|rg|cat|sed)\b/,
      postgres: /postgres|\bpsql\b/,
      notion: /notion/,
      github: /github|\bgh\b/,
    }))
      if (pattern.test(value)) sources.add(source)
    if (tool.name.startsWith('mcp__') && !/wholeloop/.test(tool.name))
      sources.add(tool.name.split('__')[1] ?? tool.name)
    if (tool.input.type === 'mcp_tool_call' && typeof tool.input.server === 'string')
      sources.add(tool.input.server)
  }
  const questions = Object.fromEntries(
    trace.requiredQuestions.map((question) => [
      question,
      parsed.text.some((part) =>
        part.text
          .split('\n')
          .some(
            (line) => line.includes('?') && line.toLowerCase().includes(question.toLowerCase()),
          ),
      ),
    ]),
  )
  const first = parsed.text.find((part) => /\?|\bplan\b/i.test(part.text))
  const intervals = parsed.workers
    .flatMap((worker) =>
      worker.finishedMs === null
        ? []
        : [
            { at: worker.startedMs, change: 1 },
            { at: worker.finishedMs, change: -1 },
          ],
    )
    .sort((a, b) => a.at - b.at || a.change - b.change)
  let active = 0,
    peak = 0
  for (const interval of intervals) {
    active += interval.change
    peak = Math.max(peak, active)
  }
  const incompleteWorkers = parsed.workers.some((worker) => worker.finishedMs === null)
  return {
    schema: 'wholeloop/experience-report@1' as const,
    provenance: trace.provenance,
    client: trace.client,
    step: trace.step,
    exitCode: trace.exitCode,
    wallMs: trace.wallMs,
    firstQuestionOrPlanMs: first?.atMs ?? null,
    tokens: parsed.tokens,
    workers: parsed.workers.length,
    peakWorkers: incompleteWorkers ? null : peak,
    concurrent: incompleteWorkers ? null : peak > 1,
    toolCalls: parsed.tools.length,
    approvalPrompts: parsed.approvals,
    textLines: text.trim() ? text.trimEnd().split('\n').length : 0,
    finalLines: !parsed.finalText?.trim() ? null : parsed.finalText.trimEnd().split('\n').length,
    rawJson: /(?:^|\n)\s*(?:\{\s*"|\[\s*\{)|```json\b/.test(text),
    bannedTerms: bannedTerms(text),
    sources: [...sources].sort(),
    unchosenSources: [...sources].filter((source) => !trace.chosenSources.includes(source)).sort(),
    fixedSleeps: commands.filter((command) => /\bsleep(?:\s|$)|setTimeout\s*\(/.test(command))
      .length,
    questions,
    diagnostics: parsed.diagnostics,
  }
}
export type ExperienceReport = ReturnType<typeof experienceReport>
