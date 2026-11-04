import { describe, expect, it } from 'vitest'
import {
  campaignMarkdown,
  campaignReport,
  type LiveTrial,
  trialVerdict,
} from '../../evals/campaign/report.js'

const trial = (overrides: Partial<LiveTrial> = {}): LiveTrial => ({
  schema: 'wholeloop/live-trial@1',
  scenario: 'EVAL-10',
  target: 'claude',
  version: '2.1.316',
  model: 'claude-opus-5-5',
  run: `delivery-${'a'.repeat(16)}`,
  seconds: 900,
  exit: 0,
  status: { state: 'completed', outcome: 'completed-with-unknowns', stages: [] },
  humanWaits: 0,
  native: [{ status: 'succeeded', reason: null, provenance: 'host-observed' }],
  usage: { outputTokens: 60000, costMicros: 6000000, unreported: 0 },
  ...overrides,
})

describe('P6-27 three-run campaign report', () => {
  it.each([
    ['a completed run', trial(), true, null],
    ['a human wait', trial({ humanWaits: 1 }), false, 'human-waits:1'],
    [
      'a refused launch',
      trial({
        native: [{ status: 'failed', reason: 'permission-denied', provenance: 'host-observed' }],
      }),
      false,
      'launch-failed:permission-denied',
    ],
    [
      'a fixture launch',
      trial({ native: [{ status: 'succeeded', reason: null, provenance: 'fixture' }] }),
      false,
      'launch-succeeded:unrecorded',
    ],
    [
      'a blocked route',
      trial({
        status: {
          state: 'blocked',
          outcome: 'blocked',
          stages: [{ id: 'research', status: 'unknown' }],
        },
      }),
      false,
      'run-blocked:research:unknown',
    ],
    [
      'an outcome its route does not allow',
      trial({ status: { state: 'completed', outcome: 'ready-pr', stages: [] } }),
      false,
      'outcome:ready-pr',
    ],
    ['no launch at all', trial({ native: [] }), false, 'no-native-launch'],
  ])('judges %s from retained facts', (_name, value, passed, cause) => {
    expect(trialVerdict(value)).toEqual({ passed, cause })
  })
  it('needs three passes per scenario and client, and keeps every failure', () => {
    const report = campaignReport(
      [
        trial({ run: 'one' }),
        trial({
          run: 'refused',
          native: [{ status: 'failed', reason: 'permission-denied', provenance: 'host-observed' }],
        }),
        trial({ run: 'two' }),
        trial({ run: 'three' }),
        trial({ run: 'codex', target: 'codex', version: '0.166.0', model: 'gpt-6.1-sol' }),
      ],
      [
        { scenario: 'EVAL-10', target: 'claude' },
        { scenario: 'EVAL-09', target: 'claude' },
      ],
    )
    expect(report.complete).toBe(false)
    expect(
      report.rows.map((row) => [row.scenario, row.target, row.passed, row.attempted, row.verdict]),
    ).toEqual([
      ['EVAL-09', 'claude', 0, 0, 'pending'],
      ['EVAL-10', 'claude', 3, 4, 'three-passes'],
      ['EVAL-10', 'codex', 1, 1, 'pending'],
    ])
    // Only passing runs size the campaign.
    expect(report.rows.find((row) => row.target === 'claude' && row.passed)?.outputTokens).toBe(
      180000,
    )
    expect(campaignMarkdown(report)).toContain('launch-failed:permission-denied')
    expect(campaignReport([trial(), trial(), trial()]).complete).toBe(true)
    expect(() =>
      campaignReport([{ ...trial(), schema: 'other' } as unknown as LiveTrial]),
    ).toThrow()
  })
})
