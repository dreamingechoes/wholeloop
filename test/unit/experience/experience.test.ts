// Synthetic native-shaped transcripts exercise measurement without spending quota or using private logs.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  calibrateExperience,
  EXPERIENCE_STEPS,
  experienceBaseline,
  experienceFailures,
} from '../../../src/experience/budgets.js'
import { experienceReport } from '../../../src/experience/report.js'
import {
  type ExperienceClient,
  experienceTrace,
  parseTranscript,
} from '../../../src/experience/transcript.js'
import { storePath } from '../../../src/state/paths.js'
import {
  experienceEnvironment,
  experiencePrompt,
  experienceRecipe,
} from '../../evals/experience/plan.js'

const fixture = (client: ExperienceClient) =>
  experienceTrace(JSON.parse(readFileSync(`test/fixtures/experience/${client}.json`, 'utf8')))
const budget = {
  inputTokens: 1000,
  outputTokens: 90,
  firstQuestionOrPlanMs: 100,
  toolCalls: 5,
  wallMs: 4000,
}

describe.each(['codex', 'claude'] as const)('%s native experience parser', (client) => {
  it('counts visible text, client usage and overlapping workers without counting tool output', () => {
    const trace = fixture(client),
      report = experienceReport(trace)
    expect(report).toMatchObject({
      provenance: 'synthetic',
      wallMs: 4000,
      firstQuestionOrPlanMs: 100,
      tokens: { input: 1000, output: 90 },
      workers: 2,
      peakWorkers: 2,
      concurrent: true,
      finalLines: 2,
      textLines: 4,
      rawJson: false,
      bannedTerms: [],
      fixedSleeps: 0,
      questions: { sources: true },
      diagnostics: [],
    })
    expect(report.sources).toEqual(['codebase'])
    expect(experienceFailures(report, { [`${client}/research`]: budget })).toEqual([])
    expect(experienceFailures(report)).toEqual(['Live baseline calibration pending'])
  })
  it('fails safely on missing usage, truncated output and incomplete workers', () => {
    const trace = fixture(client)
    trace.events = trace.events.slice(0, 4)
    const report = experienceReport(trace)
    expect(report.tokens).toBeNull()
    expect(report.diagnostics).toContain('No completed client result')
    expect(report.diagnostics).toContain('Worker completion not observed')
    expect(experienceFailures(report)).toContain('Token usage not observed')
  })
  it('reports unsupported shapes rather than assuming zero cost', () => {
    const trace = fixture(client)
    trace.events.push({ atMs: 3000, event: { type: 'future-event' } })
    expect(
      experienceFailures(experienceReport(trace)).some((failure) =>
        failure.includes('Unsupported'),
      ),
    ).toBe(true)
  })
  it('rejects an invalid or non-monotonic clock', () => {
    const trace = fixture(client)
    trace.events.push({ atMs: -1, event: {} })
    expect(() => experienceTrace(trace)).toThrow('unordered')
  })
  it('plans bounded native invocations without permission bypasses', () => {
    const args = experienceRecipe(client, '/fixture/application', '/fixture/state')
    expect(args).not.toContain('--ephemeral')
    expect(args).not.toContain('--dangerously-skip-permissions')
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(args).toContain('/fixture/state')
    expect(args).toContain(client === 'codex' ? '--ignore-user-config' : '--strict-mcp-config')
    for (const step of EXPERIENCE_STEPS)
      expect(experiencePrompt(step, '/fixture/wl', '/fixture/state')).toContain(`wl-${step}`)
  })
})

describe('experience budgets and provenance', () => {
  it('never counts a background launch acknowledgement as a finished worker', () => {
    const trace = fixture('claude')
    const launch = trace.events[2]?.event.message
    if (!launch || typeof launch !== 'object') throw new Error('Missing fixture launch')
    const blocks = (launch as { content: { input: Record<string, unknown> }[] }).content
    for (const block of blocks) block.input.run_in_background = true
    expect(experienceFailures(experienceReport(trace))).toContain('Worker completion not observed')
    expect(experienceReport(trace).peakWorkers).toBeNull()
  })
  it('keeps the default store and client configuration in the isolated fixture', () => {
    const env = experienceEnvironment('/fixture/application', '/fixture/home', '/fixture/state', {
      WL_WORKSPACE: 'personal',
      CODEX_HOME: '/unrelated',
      COPILOT_HOME: '/unrelated',
      XDG_CONFIG_HOME: '/unrelated',
    })
    expect(storePath(env, '/fixture/home')).toBe('/fixture/state/wholeloop')
    expect(env.CODEX_HOME).toBe('/fixture/home/.codex')
    expect(env.COPILOT_HOME).toBe('/fixture/home/.copilot')
    expect(env.XDG_CONFIG_HOME).toBe('/fixture/home/.config')
    expect(experiencePrompt('research', '/fixture/wl', '/fixture/state/wholeloop')).toContain(
      'Do not add --store to commands that do not support it',
    )
  })
  it('counts blank lines in a final answer and refuses an empty answer', () => {
    const trace = fixture('claude')
    const result = trace.events.at(-1)
    if (!result) throw new Error('Missing fixture result')
    result.event.result = `Answer\n${'\n'.repeat(25)}More`
    expect(experienceFailures(experienceReport(trace))).toContain(
      'Final answer missing or exceeds 25 lines',
    )
    result.event.result = ''
    expect(experienceReport(trace).finalLines).toBeNull()
  })
  it('catches actual transcript violations, while ignoring internal tool results', () => {
    const trace = fixture('codex')
    trace.events.splice(
      -2,
      0,
      {
        atMs: 1950,
        event: {
          type: 'item.completed',
          item: {
            id: 'leak',
            type: 'agent_message',
            text: 'The preflight has a quorum.\n```json\n{"run":"example"}\n```',
          },
        },
      },
      {
        atMs: 1960,
        event: {
          type: 'item.completed',
          item: { id: 'sleep', type: 'command_execution', command: 'sleep 45; psql -c SELECT' },
        },
      },
      { atMs: 1970, event: { type: 'approval.requested' } },
    )
    const report = experienceReport(trace),
      failures = experienceFailures(report)
    expect(report.approvalPrompts).toBe(1)
    expect(failures).toEqual(
      expect.arrayContaining([
        'Raw JSON shown',
        'Unchosen sources: postgres',
        'Fixed sleeps observed',
      ]),
    )
    expect(report.bannedTerms).toEqual(['preflight', 'quorum'])
  })
  it('does not count assertions that a question was asked as the question', () => {
    const trace = fixture('claude')
    trace.requiredQuestions = ['owner']
    expect(experienceFailures(experienceReport(trace))).toContain('Question not asked: owner')
  })
  it('checks inclusive wall, worker, final, token, first-answer and build limits', () => {
    const report = experienceReport(fixture('codex')),
      baseline = { 'codex/research': budget }
    expect(experienceFailures({ ...report, wallMs: 180000, workers: 3 }, baseline)).toEqual([])
    expect(
      experienceFailures({ ...report, wallMs: 180001, workers: 4, finalLines: 26 }, baseline),
    ).toEqual(
      expect.arrayContaining([
        'Wall time exceeds 180000ms',
        'Research exceeds three workers',
        'Final answer missing or exceeds 25 lines',
      ]),
    )
    expect(
      experienceFailures(
        {
          ...report,
          tokens: { input: 1001, output: 0, cached: 0 },
          firstQuestionOrPlanMs: 101,
          toolCalls: 6,
        },
        baseline,
      ),
    ).toEqual([
      'Input tokens exceed baseline',
      'First question or plan exceeds baseline',
      'Tool calls exceed baseline',
    ])
    expect(
      experienceFailures(
        { ...report, step: 'build-slice', wallMs: 4001 },
        { 'codex/build-slice': budget },
      ),
    ).toEqual(['Build gates exceed baseline'])
    expect(
      experienceFailures(
        { ...report, step: 'frame-problem', wallMs: 300001 },
        { 'codex/frame-problem': budget },
      ),
    ).toContain('Wall time exceeds 300000ms')
  })
  it('never calibrates a baseline from synthetic evidence or incomplete coverage', () => {
    const reports = ['codex', 'claude'].flatMap((client) =>
      EXPERIENCE_STEPS.map((step) => ({
        ...experienceReport(fixture(client as ExperienceClient)),
        step,
      })),
    )
    expect(() => calibrateExperience(reports)).toThrow('Incomplete live baseline')
    expect(() => calibrateExperience([])).toThrow('Need one live baseline')
    const live = reports.map((report) => ({ ...report, provenance: 'live' as const }))
    const baseline = calibrateExperience(live)
    expect(Object.keys(baseline)).toHaveLength(12)
    const tighter = calibrateExperience(
      live.map((report) => ({ ...report, tokens: { input: 999, output: 10, cached: 0 } })),
      baseline,
    )
    expect(tighter['codex/research']?.inputTokens).toBe(999)
    expect(calibrateExperience(live, tighter)).toEqual(tighter)
  })
  it.each([
    null,
    { 'codex/research': {} },
    { 'codex/research': { ...budget, inputTokens: -1 } },
    { unknown: budget },
  ])('rejects malformed calibration: %j', (value) => {
    expect(() => experienceBaseline(value)).toThrow('Invalid experience')
  })
  it('refuses the live npm entry point without starting a client', () => {
    const env = { ...process.env }
    delete env.WHOLELOOP_LIVE_CONFIRM
    const result = spawnSync(process.execPath, ['scripts/check-experience.mjs'], {
      env,
      encoding: 'utf8',
    })
    expect(result.status).toBe(3)
    expect(result.stderr).toContain('No client started')
  })
  it('does not duplicate Claude complete text and partial events', () => {
    const trace = fixture('claude')
    trace.events.push({
      atMs: 2200,
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { text: 'partial' } },
      },
    })
    expect(parseTranscript(trace).text).toHaveLength(2)
  })
})
