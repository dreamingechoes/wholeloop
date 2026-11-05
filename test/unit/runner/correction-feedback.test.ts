import { describe, expect, it } from 'vitest'
import type { AcceptanceCase, AcceptanceCaseResult } from '../../../src/acceptance/contracts.js'
import { integrationCorrectionCases } from '../../../src/runner/integration-stages.js'

const definition = (
  id: string,
  kind: AcceptanceCase['runner']['kind'],
  capability: string,
): AcceptanceCase => ({
  id,
  criteria: ['search'],
  owner: 'machine',
  applicability: 'applicable',
  rationale: 'Definition-only rationale.',
  initial: 'Definition-only initial state.',
  actions: [`${id} pinned action`],
  assertions: [
    {
      id: 'outcome',
      subject: 'json',
      operator: 'equals',
      path: '/private-path',
      expected: 'PRIVATE_EXPECTED_CANARY',
      description: `${id} pinned description`,
    },
  ],
  failureConditions: [`${id} pinned failure`],
  runner: { kind, capability, input: 'PRIVATE_RUNNER_INPUT_CANARY' },
  fixture: { ref: 'fixture:private-canary', sha256: 'a'.repeat(64) },
  timeoutMs: 1000,
})

describe('correction feedback privacy projection', () => {
  it.each([
    ['api', 'http.request'],
    ['cli', 'process.exec'],
    ['browser', 'browser.journey'],
  ] as const)('retains only public guidance for %s/%s', (kind, capability) => {
    const test = definition('public-case', kind, capability),
      feedback = integrationCorrectionCases([test], [{ case: test.id, status: 'failed' }])
    expect(feedback).toEqual([
      {
        case: test.id,
        status: 'failed',
        actions: test.actions,
        assertions: [{ id: 'outcome', description: 'public-case pinned description' }],
        failureConditions: test.failureConditions,
      },
    ])
    feedback[0]?.actions?.push('Worker-side edit')
    if (feedback[0]?.assertions?.[0]) feedback[0].assertions[0].description = 'Worker-side edit'
    feedback[0]?.failureConditions?.push('Worker-side edit')
    expect(JSON.stringify(test)).not.toContain('Worker-side edit')
  })

  it.each(['passed', 'failed', 'interrupted', 'unavailable'] as const)(
    'reveals only private case identity and %s status',
    (status) => {
      const test = definition('opaque-case', 'api', 'evaluator.private-http'),
        result = {
          case: test.id,
          status,
          reason: 'PRIVATE_REASON_CANARY',
          artifacts: ['PRIVATE_ARTIFACT_CANARY'],
          assertions: [{ id: 'PRIVATE_ASSERTION_CANARY' }],
        }
      expect(integrationCorrectionCases([test], [result])).toEqual([{ case: test.id, status }])
    },
  )

  it('keeps missing or unsupported definitions opaque and preserves result order', () => {
    const unsupported = definition('unsupported', 'semantic', 'evaluator.private-http'),
      results: Pick<AcceptanceCaseResult, 'case' | 'status'>[] = [
        { case: 'missing', status: 'unavailable' },
        { case: 'unsupported', status: 'failed' },
      ]
    expect(integrationCorrectionCases([unsupported], results)).toEqual(results)
  })
})
