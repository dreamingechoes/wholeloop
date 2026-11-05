import { expect, it } from 'vitest'
import { ciCorrectionFeedback } from '../../../src/runner/ci-correction-feedback.js'
import { correctionTask } from '../../../src/runner/correction-input.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'

it('projects fixed original code-test feedback without private publication paths or PR bodies', async () => {
  await runnerCiFailureFixture(({ store, input }) => {
    const before = JSON.stringify(store.lifecycle.journal.events()),
      entry = {
        unit: 'search',
        origin: 'ci' as const,
        revision: 2,
        request: input.request,
        stage: 'ci',
        failure: input.failure,
      },
      feedback = ciCorrectionFeedback(store, entry)
    expect(feedback).toMatchObject({
      origin: 'ci',
      stage: 'ci',
      cases: [],
      ci: {
        historical: true,
        failures: [
          { check: 'test', issuer: 'github-app:15368', state: 'failure', class: 'code-test' },
        ],
      },
    })
    expect(JSON.stringify(feedback)).not.toContain(store.files.root)
    expect(JSON.stringify(feedback)).not.toMatch(
      /https:\/\/github.com|Fixture Owner|publication-marker/,
    )
    expect(correctionTask(feedback).prompt).toContain('original published product head')
    expect(() => ciCorrectionFeedback(store, { ...entry, failure: 'd'.repeat(64) })).toThrow(
      'original-ci-failure-unavailable',
    )
    expect(() => ciCorrectionFeedback(store, { ...entry, unit: 'foreign' })).toThrow(
      'correction-ci-feedback-binding',
    )
    expect(JSON.stringify(store.lifecycle.journal.events())).toBe(before)
    const old = {
      origin: 'integration' as const,
      stage: 'integration:feature',
      failure: 'a'.repeat(64),
      reason: 'Retained failure.',
      cases: [],
    }
    expect(correctionTask(old).prompt).toBe(
      JSON.stringify({
        instruction:
          'Correct only the recorded integration or acceptance failure within this pinned unit, starting from its failed head. Preserve acceptance definitions and criteria. Report production honestly; the commit and independent QA are separate.',
        feedback: old,
      }),
    )
  })
})
