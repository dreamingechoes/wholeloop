import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import {
  FRAME_REVIEW_COVERAGE,
  type FrameReview,
  finalizeFrame,
  frameDigest,
  prepareFrame,
} from '../../../src/framing/finalize.js'
import { StateStore } from '../../../src/state/store.js'

const artifact = readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8')
const decision = {
  schema: 'wholeloop/frame-decision@1' as const,
  by: 'Alex',
  outcome: 'on-hold' as const,
  reason: 'No observed problem yet',
  reopen: 'User evidence confirms difficulty finding tasks',
  stopConditions: ['Pause while evidence is missing'],
}
function fixture(run: (dir: string, engine: FlowEngine, subject: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-final-frame-'))
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    dir,
    join(dir, 'config.yml'),
    join(dir, 'home'),
  )
  try {
    const subject =
      engine.begin('frame-problem', { input: 'Task search', owner: 'Alex' }).payload.subject?.id ??
      ''
    run(dir, engine, subject)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function reviewed(engine: FlowEngine, subject: string) {
  const draft = prepareFrame(engine, subject, artifact, decision)
  const review: FrameReview = {
    ...draft.reviewTemplate,
    schema: 'wholeloop/frame-review@1',
    reviewer: {
      by: 'Challenger',
      sha256: draft.artifact.sha256,
      coverage: [...FRAME_REVIEW_COVERAGE],
      unresolvedFindings: [],
    },
  }
  return { content: draft.artifact.content, review }
}

describe('final framing decision fidelity and revision review', () => {
  it('replaces suggested stop rules with the exact explicit owner decision without writing state', () =>
    fixture((_dir, engine, subject) => {
      const before = engine.store.events()
      const draft = prepareFrame(
        engine,
        subject,
        artifact.replace(
          '## Stop conditions',
          '## Stop conditions\n\nDrop if H2 fails; require a minimum segment before reopening.',
        ),
        decision,
      )
      expect(draft.artifact.content).not.toContain('Drop if H2 fails')
      expect(draft.artifact.content).toContain(`Reopen when: ${JSON.stringify(decision.reopen)}`)
      expect(draft.artifact.content).toContain(
        `Approved stop conditions: ${JSON.stringify(decision.stopConditions)}`,
      )
      expect(draft.artifact.sha256).toBe(frameDigest(draft.artifact.content))
      expect(engine.store.events()).toEqual(before)
    }))
  it('atomically completes with exact reviewed bytes, durable approval and unchanged reopening condition', () =>
    fixture((_dir, engine, subject) => {
      const { content, review } = reviewed(engine, subject)
      const receipt = finalizeFrame(engine, subject, content, review)
      expect(receipt.completion.outcome).toEqual({
        outcome: decision.outcome,
        reason: decision.reason,
        reopen: decision.reopen,
      })
      expect(receipt.completion.next.next).toBeNull()
      const store = new StateStore(engine.store.files.root)
      expect(store.get(subject).status).toBe('closed')
      expect(
        store
          .get(subject)
          .notes.some((note) => note.text === `Framing final review: ${JSON.stringify(review)}`),
      ).toBe(true)
      expect(store.files.read(receipt.completion.artifact)).toBe(content)
      expect(() => finalizeFrame(engine, subject, content, review)).toThrow('active framing')
    }))
  it.each([
    'changed-artifact',
    'stale-review',
    'other-run',
    'other-subject',
    'other-owner',
    'missing-coverage',
    'duplicate-coverage',
    'open-finding',
    'empty-reviewer',
    'extra-rule',
    'changed-outcome',
    'unknown-field',
  ])('refuses %s without journal or projection changes', (kind) =>
    fixture((_dir, engine, subject) => {
      let { content, review } = reviewed(engine, subject)
      const before = engine.store.events()
      if (kind === 'changed-artifact') content += '\nA semantic revision after review.\n'
      if (kind === 'stale-review') review.reviewer.sha256 = '0'.repeat(64)
      if (kind === 'other-run') review.run = 'run-0000000000000000'
      if (kind === 'other-subject') review.subject = 'init-00000000'
      if (kind === 'other-owner') review.decision.by = 'Someone else'
      if (kind === 'missing-coverage') review.reviewer.coverage.pop()
      if (kind === 'duplicate-coverage') review.reviewer.coverage[0] = 'evidence'
      if (kind === 'open-finding')
        review.reviewer.unresolvedFindings.push('Unapproved reopening constraint')
      if (kind === 'empty-reviewer') review.reviewer.by = ' '
      if (kind === 'unknown-field') Object.assign(review, { guessedApproval: true })
      if (kind === 'changed-outcome') review.decision.outcome = 'dropped'
      if (kind === 'extra-rule') {
        content = content.replace('## Scope hint', 'Drop if H2 fails.\n\n## Scope hint')
        review.sha256 = frameDigest(content)
        review.reviewer.sha256 = review.sha256
      }
      expect(() => finalizeFrame(engine, subject, content, review)).toThrow()
      expect(engine.store.events()).toEqual(before)
      expect(engine.store.get(subject).status).toBe('open')
    }),
  )
  it('checks the reviewed decision again inside the engine completion transaction', () =>
    fixture((_dir, engine, subject) => {
      const { content, review } = reviewed(engine, subject)
      const before = engine.store.events()
      expect(() =>
        engine.complete(
          'frame-problem',
          subject,
          content,
          { outcome: 'dropped', reason: decision.reason },
          review,
        ),
      ).toThrow('must match')
      expect(engine.store.events()).toEqual(before)
    }))
  it('keeps legacy completion readable without inventing a review attestation', () =>
    fixture((_dir, engine, subject) => {
      engine.complete('frame-problem', subject, artifact)
      expect(
        engine.store
          .get(subject)
          .notes.some((note) => note.text.startsWith('Framing final review:')),
      ).toBe(false)
    }))
  it('encodes multiline decision text as data and refuses duplicate stop sections', () =>
    fixture((_dir, engine, subject) => {
      const draft = prepareFrame(engine, subject, artifact, {
        ...decision,
        reason: 'Reason\n## False heading',
        stopConditions: ['One\nTwo'],
      })
      expect(draft.artifact.content).not.toContain('\n## False heading')
      expect(() =>
        prepareFrame(engine, subject, `${artifact}\n## Stop conditions\nExtra`, decision),
      ).toThrow('exactly one')
    }))
  it('performs draft/review/finalize through the compiled CLI and preserves failures as non-completions', () =>
    fixture((dir) => {
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
        WL_WORKSPACE: '',
        WL_SUBJECT: '',
      }
      const cli = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: dir,
          env,
          encoding: 'utf8',
        })
        return { code: result.status, value: JSON.parse(result.stdout) }
      }
      const id = cli('step', 'begin', 'frame-problem', '--input', 'Task search', '--owner', 'Alex')
        .value.subject.id
      const file = join(dir, 'frame.md'),
        input = join(dir, 'review.json')
      writeFileSync(file, artifact)
      writeFileSync(input, JSON.stringify(decision))
      expect(cli('frame', 'schema').value.reviewSchema.$id).toBe('wholeloop/frame-review@1')
      const draft = cli('frame', 'draft', '--for', id, '--artifact', file, '--file', input)
      expect(draft.code).toBe(0)
      writeFileSync(file, draft.value.artifact.content)
      const review = draft.value.reviewTemplate
      writeFileSync(input, JSON.stringify(review))
      expect(cli('frame', 'finalize', '--for', id, '--artifact', file, '--file', input).code).toBe(
        4,
      )
      review.reviewer = { ...review.reviewer, by: 'Challenger', coverage: FRAME_REVIEW_COVERAGE }
      writeFileSync(input, JSON.stringify(review))
      const complete = cli('frame', 'finalize', '--for', id, '--artifact', file, '--file', input)
      expect(complete.code).toBe(0)
      expect(complete.value.sha256).toBe(frameDigest(draft.value.artifact.content))
      expect(cli('status', id).value.items[0].status).toBe('closed')
    }))
})
