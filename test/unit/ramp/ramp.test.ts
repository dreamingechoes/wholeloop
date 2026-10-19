import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { validateProvider } from '../../../src/providers/manifest.js'
import type { OperationCall, ProviderHost } from '../../../src/providers/operations.js'
import { type RampPlan, rampRuns } from '../../../src/ramp/contracts.js'
import { dispatchRampProposal } from '../../../src/ramp/publish.js'
import { rampReadRequests, rampResponseHost } from '../../../src/ramp/transcript.js'
import { defaultRampStages, RampWorkflow } from '../../../src/ramp/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const check = {
  key: 'errors',
  provider: 'ramp-fixture',
  operation: 'source.errors.query',
  query: 'count newly introduced error types',
  unit: 'errors',
  operator: 'eq' as const,
  threshold: 0,
  required: true,
  lookbackHours: 1,
  timezone: 'UTC',
}
function plan(stages = 2, flag = true): RampPlan {
  return {
    schema: 'wholeloop/ramp-plan@1',
    environment: 'disposable',
    ...(flag ? { flag: 'orders-search' } : {}),
    confirmedBy: 'Alex',
    stages: [
      {
        key: 'pilot',
        audience: 'internal',
        enabled: true,
        exposure: 10,
        exit: 'No newly introduced errors',
        checks: [check],
      },
      {
        key: 'general',
        audience: 'all',
        enabled: true,
        exposure: 100,
        exit: 'No newly introduced errors through the pilot window',
        checks: [check],
      },
    ].slice(0, stages),
  }
}
async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: RampWorkflow
    host: ProviderHost
    calls: OperationCall[]
    state: { enabled: boolean; exposure: number; audience: string }
    source: { value: number; unit: string; unavailable: boolean }
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-ramp-'))
  const root = join(dir, 'repo')
  mkdirSync(join(root, '.wholeloop/providers/ramp-fixture'), { recursive: true })
  writeFileSync(
    join(root, '.wholeloop/config.yml'),
    'version: 1\nproviders:\n  flags: ramp-fixture\n',
  )
  writeFileSync(
    join(root, '.wholeloop/providers/ramp-fixture/provider.json'),
    JSON.stringify({
      schema: 1,
      id: 'ramp-fixture',
      name: 'Ramp fixture',
      description: 'Synthetic read-only flags and error counts',
      capabilities: ['flags', 'source.errors'],
      access: { native: true },
      operations: {
        'flags.read-state': { tool: 'read_flag' },
        'flags.propose-change': { tool: 'propose_flag' },
        'source.errors.query': { tool: 'count_errors' },
      },
      degrade: {
        'flags.read-state': 'open-question',
        'flags.propose-change': 'handoff-artifact',
        'source.errors.query': 'open-question',
      },
    }),
  )
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  const calls: OperationCall[] = []
  const state = { enabled: false, exposure: 0, audience: 'all' }
  const source = { value: 0, unit: 'errors', unavailable: false }
  const host: ProviderHost = {
    invoke: async (call) => {
      calls.push(call)
      if (call.operation === 'flags.read-state')
        return {
          status: 'succeeded',
          complete: true,
          revision: `revision-${calls.length}`,
          ref: 'https://example.com/flag/orders-search',
          body: JSON.stringify({ flag: 'orders-search', environment: 'disposable', ...state }),
        }
      if (call.operation !== 'source.errors.query')
        throw new Error('Unexpected mutation/tool request')
      if (source.unavailable) throw new Error('private fixture tool detail')
      return {
        status: 'succeeded',
        complete: true,
        ref: 'https://example.com/query/errors',
        body: JSON.stringify({ value: source.value, unit: source.unit }),
      }
    },
  }
  try {
    await run({ dir, root, engine, workflow: new RampWorkflow(engine), host, calls, state, source })
  } finally {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  }
}
function started(workflow: RampWorkflow, input = plan()) {
  const result = workflow.begin({ input: 'Order search ramp', owner: 'Alex', plan: input })
  if (result.status !== 'planned') throw new Error('Expected ramp plan')
  return result
}
function approve(
  workflow: RampWorkflow,
  subject: string,
  outcome: 'go' | 'hold' | 'rollback' = 'go',
  acknowledgedRisks: string[] = [],
) {
  const basis = workflow.report(subject).observation?.event
  if (!basis) throw new Error('Observe evidence before fixture approval')
  return workflow.decide(subject, outcome, {
    basis,
    by: 'Alex',
    reason: 'Reviewed the exact recorded source evidence',
    acknowledgedRisks,
  })
}

describe('evidence-bound per-stage ramps', () => {
  it('blocks changed controls and requires a fresh full window after restoration', async () =>
    fixture(async ({ workflow, host, state }) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
      const { subject } = started(workflow)
      await workflow.observe(subject, host)
      approve(workflow, subject)
      Object.assign(state, { enabled: true, exposure: 10, audience: 'internal' })
      await workflow.confirm(subject, host, { by: 'Alex' })
      vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
      state.exposure = 50
      const changed = await workflow.observe(subject, host)
      expect(changed.observation?.evidence.flag.status).toBe('unknown')
      expect(changed.recommendation).toBe('hold')
      expect(() => approve(workflow, subject)).toThrow('required checks passed')
      state.exposure = 10
      const restored = await workflow.observe(subject, host)
      expect(restored.observation?.evidence.checks[0]?.status).toBe('unknown')
      expect(() => approve(workflow, subject)).toThrow('required checks passed')
      vi.setSystemTime(new Date('2026-10-01T13:00:00Z'))
      expect((await workflow.observe(subject, host)).recommendation).toBe('go')
    }))

  it('deduplicates identical reads while preserving each independently planned criterion', async () =>
    fixture(async ({ workflow }) => {
      const input = plan()
      input.stages[0]?.checks.push({ ...check, key: 'same-errors' })
      const { subject } = started(workflow, input)
      const requests = await rampReadRequests(workflow, subject, 'observe')
      expect(requests.requests).toHaveLength(2)
      const host = rampResponseHost(
        {
          schema: 'wholeloop/ramp-read-responses@1',
          run: requests.run,
          stage: requests.stage,
          at: requests.at,
          mode: requests.mode,
          results: requests.requests.map(({ fingerprint }) => ({
            fingerprint,
            unavailable: 'Unavailable in fixture',
          })),
        },
        requests,
      )
      expect(
        (await workflow.observe(subject, host, requests.at)).observation?.evidence.checks,
      ).toHaveLength(2)
    }))

  it('dispatches only an approved unapplied proposal and caches the receipt', async () =>
    fixture(async ({ workflow, host, state, engine }) => {
      const { subject } = started(workflow)
      await workflow.observe(subject, host)
      approve(workflow, subject)
      const calls: OperationCall[] = []
      const proposalHost: ProviderHost = {
        invoke: async (call) => {
          calls.push(call)
          expect(engine.store.events().at(-1)?.type).toBe('ramp.proposal-planned')
          expect(call.operation).toBe('flags.propose-change')
          expect(call.args).toMatchObject({
            apply: false,
            proposalOnly: true,
            desired: { exposure: 10 },
          })
          return {
            status: 'succeeded',
            ref: 'https://example.com/proposal/1',
            body: JSON.stringify({ applied: false }),
          }
        },
      }
      expect((await dispatchRampProposal(workflow, subject, proposalHost)).cached).toBe(false)
      expect((await dispatchRampProposal(workflow, subject, proposalHost)).cached).toBe(true)
      expect(calls).toHaveLength(1)
      expect(state.enabled).toBe(false)
      expect(workflow.report(subject).index).toBe(0)
    }))

  it('retains ambiguity for an applied or lost proposal instead of repeating a write', async () =>
    fixture(async ({ workflow, host }) => {
      const { subject } = started(workflow)
      await workflow.observe(subject, host)
      approve(workflow, subject)
      const applied = {
        invoke: async () => ({
          status: 'succeeded' as const,
          ref: 'https://example.com/proposal/1',
          body: JSON.stringify({ applied: true }),
        }),
      }
      await expect(dispatchRampProposal(workflow, subject, applied)).rejects.toThrow('ambiguous')
      await expect(dispatchRampProposal(workflow, subject, applied)).rejects.toThrow('ambiguous')
    }))

  it('rejects recognized toggle and apply routes in proposal manifests', () => {
    const base = {
      schema: 1,
      id: 'flag-fixture',
      name: 'Flag fixture',
      description: 'Proposal route validation',
      capabilities: ['flags'],
      access: { native: true },
      degrade: { 'flags.propose-change': 'handoff-artifact' },
    }
    for (const mapping of [
      { tool: 'toggle' },
      { tool: 'proxy', args: { action: 'updateFlag' } },
      { tool: 'propose', args: { apply: true } },
    ])
      expect(() =>
        validateProvider({ ...base, operations: { 'flags.propose-change': mapping } }),
      ).toThrow('proposal-only')
  })

  it('asks for a confirmed plan and exposes default audience stages without mutating state', async () =>
    fixture(({ workflow, engine }) => {
      const result = workflow.begin({})
      expect(result.status).toBe('question')
      expect(result.questions.map((item) => item.id)).toEqual(['owner', 'input', 'plan'])
      expect(defaultRampStages().map((stage) => stage.key)).toEqual([
        'off',
        'internal',
        'ten',
        'half',
        'all',
      ])
      expect(engine.store.events()).toEqual([])
    }))

  it('keeps unreadable sources unknown, preserves zero as observed, and never argues unknown required evidence into go', async () =>
    fixture(async ({ workflow, engine, host, source }) => {
      const start = started(workflow)
      source.unavailable = true
      const missing = await workflow.observe(start.subject, host)
      expect(missing.recommendation).toBe('hold')
      expect(missing.observation?.evidence.checks[0]?.status).toBe('unknown')
      expect(missing.observation?.evidence.checks[0]?.value).toBeUndefined()
      expect(JSON.stringify(engine.store.events())).not.toContain('private fixture tool detail')
      expect(() => approve(workflow, start.subject)).toThrow('required checks passed')
      source.unavailable = false
      const observed = await workflow.observe(start.subject, host)
      expect(observed.observation?.evidence.checks[0]).toMatchObject({
        status: 'pass',
        value: 0,
        unit: 'errors',
      })
      expect(observed.recommendation).toBe('go')
    }))

  it('records who/when/exact evidence, waits for external confirmation and requires the next stage window after exposure', async () =>
    fixture(async ({ workflow, engine, host, state, calls }) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
      const start = started(workflow)
      const first = await workflow.observe(start.subject, host)
      const shown = first.observation?.event
      approve(workflow, start.subject)
      expect(workflow.proposal(start.subject)).toMatchObject({
        operation: 'flags.propose-change',
        applied: false,
        desired: { enabled: true, exposure: 10, audience: 'internal' },
      })
      expect(state.enabled).toBe(false)
      await expect(workflow.confirm(start.subject, host, { by: 'Alex' })).rejects.toThrow(
        'has not confirmed',
      )
      Object.assign(state, { enabled: true, exposure: 10, audience: 'internal' }) // The person acts outside the core.
      vi.setSystemTime(new Date('2026-10-01T12:00:01.000Z'))
      expect((await workflow.confirm(start.subject, host, { by: 'Alex' })).index).toBe(1)
      const count = calls.filter((call) => call.operation === 'source.errors.query').length
      const early = await workflow.observe(start.subject, host)
      expect(early.observation?.evidence.checks[0]?.status).toBe('unknown')
      expect(early.observation?.evidence.checks[0]?.missing).toContain(
        'before the confirmed exposure',
      )
      expect(calls.filter((call) => call.operation === 'source.errors.query')).toHaveLength(count)
      vi.setSystemTime(new Date('2026-10-01T13:00:02.000Z'))
      await workflow.observe(start.subject, host)
      approve(workflow, start.subject)
      Object.assign(state, { enabled: true, exposure: 100, audience: 'all' })
      vi.setSystemTime(new Date('2026-10-01T13:00:03.000Z'))
      const complete = await workflow.confirm(start.subject, host, { by: 'Alex' })
      expect(complete.complete).toBe(true)
      expect(engine.plan(start.subject).next).toBe('measure-impact')
      expect(engine.plan(start.subject).pending).toEqual([])
      const decisions = engine.store.events().filter((event) => event.type === 'ramp.decided')
      expect(decisions).toHaveLength(2)
      expect(decisions[0]?.type === 'ramp.decided' && decisions[0].data.basis).toBe(shown)
      expect(decisions[0]?.type === 'ramp.decided' && decisions[0].data.by).toBe('Alex')
      expect(decisions.every((event) => !!event.ts)).toBe(true)
      expect(
        calls.every((call) => ['flags.read-state', 'source.errors.query'].includes(call.operation)),
      ).toBe(true)
    }))

  it('requires an explicit acknowledgment for each optional unknown signal', async () =>
    fixture(async ({ workflow, host }) => {
      const input = plan(1)
      input.stages[0]?.checks.push({
        ...check,
        key: 'support',
        provider: 'missing-support',
        unit: 'tickets',
        required: false,
      })
      const start = started(workflow, input)
      const observed = await workflow.observe(start.subject, host)
      expect(observed.recommendation).toBe('review-open-signals')
      expect(() => approve(workflow, start.subject)).toThrow('acknowledgment')
      expect(() => approve(workflow, start.subject, 'go', ['support'])).not.toThrow()
      expect(
        workflow
          .report(start.subject)
          .observation?.evidence.checks.find((row) => row.key === 'support')?.status,
      ).toBe('unknown')
    }))

  it('invalidates old evidence bases and rejects forged passing values and windows', async () =>
    fixture(async ({ workflow, engine, host }) => {
      const start = started(workflow)
      const first = await workflow.observe(start.subject, host)
      const latest = await workflow.observe(start.subject, host)
      expect(() =>
        workflow.decide(start.subject, 'go', {
          basis: first.observation?.event ?? '',
          by: 'Alex',
          reason: 'Stale view',
        }),
      ).toThrow('current displayed evidence')
      const evidence = latest.observation?.evidence
      if (!evidence) throw new Error('Missing fixture evidence')
      const row = evidence.checks[0]
      if (!row) throw new Error('Missing fixture row')
      const before = engine.store.events().length
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(start.subject, {
            type: 'ramp.observed',
            data: { ...evidence, checks: [{ ...row, value: 5, status: 'pass' }] },
          }),
        ),
      ).toThrow('planned comparison')
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(start.subject, {
            type: 'ramp.observed',
            data: {
              ...evidence,
              checks: [{ ...row, window: { ...row.window, start: row.window.end } }],
            },
          }),
        ),
      ).toThrow('planned lookback')
      expect(engine.store.events()).toHaveLength(before)
    }))

  it('treats a unit mismatch or missing flag provider as unknown rather than assuming zero/off', async () =>
    fixture(async ({ workflow, root, host, source }) => {
      const start = started(workflow)
      source.unit = 'milliseconds'
      expect(
        (await workflow.observe(start.subject, host)).observation?.evidence.checks[0]?.status,
      ).toBe('unknown')
      writeFileSync(join(root, '.wholeloop/config.yml'), 'version: 1\n')
      source.unit = 'errors'
      const missing = await workflow.observe(start.subject, host)
      expect(missing.observation?.evidence.flag.status).toBe('unknown')
      expect(missing.observation?.evidence.flag.enabled).toBeUndefined()
      expect(() => approve(workflow, start.subject)).toThrow('required checks passed')
    }))

  it('records hold without advancing, and rollback only after disabled-state confirmation', async () =>
    fixture(async ({ workflow, host, state }) => {
      const start = started(workflow)
      await workflow.observe(start.subject, host)
      approve(workflow, start.subject, 'hold')
      expect(() => workflow.proposal(start.subject)).toThrow('explicit go or rollback')
      await expect(workflow.confirm(start.subject, host, { by: 'Alex' })).rejects.toThrow(
        'explicitly approved',
      )
      approve(workflow, start.subject, 'rollback')
      expect(workflow.proposal(start.subject).desired).toEqual({ enabled: false })
      Object.assign(state, { enabled: true, exposure: 10, audience: 'internal' })
      await expect(workflow.confirm(start.subject, host, { by: 'Alex' })).rejects.toThrow(
        'disabled flag',
      )
      state.enabled = false
      expect((await workflow.confirm(start.subject, host, { by: 'Alex' })).index).toBe(0)
    }))

  it('supports manual one-stage go/no-go with explicit human confirmation evidence', async () =>
    fixture(async ({ workflow, host }) => {
      const start = started(workflow, plan(1, false))
      await workflow.observe(start.subject, host)
      approve(workflow, start.subject)
      expect(workflow.proposal(start.subject).operation).toBe('manual-exposure-proposal')
      await expect(workflow.confirm(start.subject, host, { by: 'Alex' })).rejects.toThrow(
        'evidence reference',
      )
      expect(
        (
          await workflow.confirm(start.subject, host, {
            by: 'Alex',
            manualEvidence: 'https://example.com/manual-exposure-check',
          })
        ).complete,
      ).toBe(true)
    }))

  it('resumes byte-identically and cannot complete from a fabricated step artifact', async () =>
    fixture(async ({ workflow, engine, host }) => {
      const start = started(workflow)
      await workflow.observe(start.subject, host)
      const before = workflow.report(start.subject)
      const path = `items/${start.subject}/ramps/${start.run}.json`
      const projection = engine.store.files.read(path)
      engine.store.rebuild()
      expect(engine.store.files.read(path)).toBe(projection)
      expect(
        new RampWorkflow(
          new FlowEngine(engine.store, engine.root, engine.userFile, engine.home),
        ).report(start.subject),
      ).toEqual(before)
      expect(() =>
        engine.complete(
          'ramp-exposure',
          start.subject,
          '# Fake\n\n## Stages\nX\n## Evidence\nX\n## Decisions\nX\n## Confirmations\nX\n## Handoff\nX\n',
        ),
      ).toThrow('every stage explicitly approved')
      expect(rampRuns(engine.store.events())[0]?.stage).toBe(0)
    }))

  it('emits exact read requests and imports matching normalized responses through the compiled CLI', async () =>
    fixture(async ({ dir, root }) => {
      const env = {
        ...process.env,
        HOME: join(dir, 'home'),
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
      }
      const call = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          env,
          encoding: 'utf8',
        })
        if (result.status !== 0) throw new Error(result.stdout + result.stderr)
        return JSON.parse(result.stdout)
      }
      const input = join(dir, 'plan.json')
      writeFileSync(input, JSON.stringify(plan(1)))
      const start = call('ramp', 'begin', 'Order search ramp', '--owner', 'Alex', '--file', input)
      const requests = call('ramp', 'requests', '--for', start.subject)
      expect(requests.performed).toBe(false)
      expect(requests.requests).toHaveLength(2)
      const file = join(dir, 'responses.json')
      const responses = (request: typeof requests) => ({
        schema: 'wholeloop/ramp-read-responses@1',
        run: request.run,
        stage: request.stage,
        at: request.at,
        mode: request.mode,
        results: request.requests.map(
          (entry: { fingerprint: string; call: { operation: string } }) => ({
            fingerprint: entry.fingerprint,
            result: {
              status: 'succeeded',
              complete: true,
              ref: 'https://example.com/fixture-read',
              revision: 'read-revision',
              body: JSON.stringify(
                entry.call.operation === 'flags.read-state'
                  ? {
                      flag: 'orders-search',
                      environment: 'disposable',
                      enabled: true,
                      exposure: 10,
                      audience: 'internal',
                    }
                  : { value: 0, unit: 'errors' },
              ),
            },
          }),
        ),
      })
      writeFileSync(file, JSON.stringify(responses(requests)))
      const observed = call('ramp', 'observe', '--for', start.subject, '--file', file)
      expect(observed.recommendation).toBe('go')
      call(
        'ramp',
        'decide',
        'go',
        '--for',
        start.subject,
        '--basis',
        observed.observation.event,
        '--by',
        'Alex',
        '--reason',
        'Reviewed exact fixture evidence',
      )
      const confirm = call('ramp', 'requests', '--for', start.subject, '--mode', 'confirm')
      writeFileSync(file, JSON.stringify(responses(confirm)))
      expect(
        call('ramp', 'confirm', '--for', start.subject, '--file', file, '--by', 'Alex').complete,
      ).toBe(true)
      expect(call('ramp', 'report', '--for', start.subject).complete).toBe(true)
    }))

  it('does not perform a service query while preparing read requests', async () =>
    fixture(async ({ workflow, calls }) => {
      const start = started(workflow)
      const requests = await rampReadRequests(workflow, start.subject, 'observe')
      expect(requests.requests).toHaveLength(2)
      expect(calls).toEqual([])
    }))
})
