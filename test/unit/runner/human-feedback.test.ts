import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerHumanDecisions } from '../../../src/runner/human-decisions.js'
import { runnerGitFixture } from '../../support/runner-git.js'

it.each(['accept', 'reject'] as const)(
  'reads historical human %s as feedback without current approval or identity',
  async (outcome) => {
    await runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const context = dispatch('acceptance'),
          record = store.stage(contractDigest(request), context.stage.id),
          humans = new RunnerHumanDecisions(store),
          subject = 'a'.repeat(64)
        if (!record) throw new Error('Original stage required')
        humans.open(request, record, subject)
        const decision = humans.record({
          request: contractDigest(request),
          stage: context.stage.id,
          decision: 'acceptance',
          subject,
          outcome,
          by: 'PRIVATE_PERSON_CANARY',
          note: 'Repair the documented observable mismatch.',
        })
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Historical feedback must survive revoked authority.',
        })
        expect(() => humans.pending(request, record)).toThrow('inactive-runner-basis')
        const before = contractDigest(store.lifecycle.journal.events()),
          feedback = humans.originalFeedback(request, record)
        expect(feedback).toEqual(
          outcome === 'reject'
            ? {
                decision: 'acceptance',
                historical: true,
                subject,
                outcome,
                note: decision.note,
                digest: contractDigest(decision),
                provenance: 'person-record',
              }
            : undefined,
        )
        expect(JSON.stringify(feedback) ?? '').not.toContain('PRIVATE_PERSON_CANARY')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        expect(() => humans.open(request, record, subject)).toThrow('inactive-runner-basis')
        expect(() =>
          humans.record({
            request: contractDigest(request),
            stage: context.stage.id,
            decision: 'acceptance',
            subject,
            outcome,
            by: 'PRIVATE_PERSON_CANARY',
          }),
        ).toThrow('inactive-runner-basis')
      },
      { singleUnit: true },
    )
  },
)

it.each(['changed-subject', 'missing-request'] as const)(
  'refuses %s human rejection history',
  async (mode) => {
    await runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const context = dispatch('acceptance'),
          record = store.stage(contractDigest(request), context.stage.id),
          humans = new RunnerHumanDecisions(store),
          subject = 'a'.repeat(64),
          base = `delivery/runner-human-decisions/${context.invocation}`
        if (!record) throw new Error('Original stage required')
        humans.open(request, record, subject)
        humans.record({
          request: contractDigest(request),
          stage: context.stage.id,
          decision: 'acceptance',
          subject,
          outcome: 'reject',
          by: 'Fixture Operator',
        })
        if (mode === 'missing-request') {
          const path = store.files.path(`${base}/request.json`)
          renameSync(path, `${path}.retained`)
        } else {
          const path = store.files.path(`${base}/decision.json`),
            value = JSON.parse(readFileSync(path, 'utf8'))
          value.subject = 'b'.repeat(64)
          writeFileSync(path, JSON.stringify(value))
        }
        expect(() => humans.originalFeedback(request, record)).toThrow()
      },
      { singleUnit: true },
    )
  },
)
