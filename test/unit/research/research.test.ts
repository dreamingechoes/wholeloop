import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type ResearchEngine, runResearch } from '../../../harness/workflows/research.js'
import { resolveConfig } from '../../../src/config/resolve.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { loadProviders } from '../../../src/providers/load.js'
import type { AngleResult, Refutation, ResearchPlan } from '../../../src/research/contracts.js'
import { validateRefutation } from '../../../src/research/contracts.js'
import { researchPlan } from '../../../src/research/plan.js'
import { renderResearchBrief, researchReport } from '../../../src/research/report.js'
import { ResearchWorkflow } from '../../../src/research/workflow.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(
  run: (dir: string, engine: FlowEngine, workflow: ResearchWorkflow) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-research-'))
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    dir,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  return Promise.resolve()
    .then(() => run(dir, engine, new ResearchWorkflow(engine)))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}
const evidence = [
  { ref: 'https://example.com/study', excerpt: 'Observed fifty returning customers.' },
]
const result = (angle: string, loadBearing = true): AngleResult => ({
  angle,
  status: 'ok',
  claims: [
    {
      id: 'claim-1',
      text: 'Returning customers need order search.',
      confidence: 'high',
      loadBearing,
      evidence,
    },
  ],
  openQuestions: [],
})
const vote = (claim: string, verifier: number, outcome: Refutation['outcome']): Refutation => ({
  claim,
  verifier,
  outcome,
  reason:
    outcome === 'refute' ? 'The cited sample excludes the target segment.' : 'Evidence inspected.',
  evidence: outcome === 'refute' ? evidence : [],
})
function plan(dir: string, verifiers = 3): ResearchPlan {
  return researchPlan({
    subject: 'brief-0123abcd',
    run: 'run-0000000000000000',
    question: 'How do people find old orders?',
    owner: 'Alex',
    configuration: resolveConfig([{ scope: 'project', values: { research: { verifiers } } }])
      .values,
    registry: loadProviders({ root: dir, user: join(dir, 'user') }),
    declarations: [],
    path: '',
    sources: ['native-code', 'native-web'],
  })
}

describe('source-bound planning and refutation arithmetic', () => {
  it('plans only configured source query providers without adding detected sources', () =>
    fixture((dir) => {
      const root = join(dir, '.wholeloop/providers/support')
      mkdirSync(root, { recursive: true })
      writeFileSync(
        join(root, 'provider.json'),
        JSON.stringify({
          schema: 1,
          id: 'support',
          name: 'Support',
          description: 'Read support evidence',
          capabilities: ['source.support'],
          access: {
            mcp: {
              server: 'support',
              install: { transport: 'http', url: 'https://support.example.com/mcp', auth: 'oauth' },
            },
          },
          operations: { 'source.support.query': { tool: 'search' } },
          degrade: { 'source.support.query': 'open-question' },
        }),
      )
      const registry = loadProviders({ root: dir, user: join(dir, 'user') })
      const build = (
        sources: string[],
        declarations = [] as { target: string; server: string; file: string; enabled: boolean }[],
      ) =>
        researchPlan({
          subject: 'brief-0123abcd',
          run: 'run-0000000000000000',
          question: 'Why?',
          owner: 'Alex',
          configuration: resolveConfig([{ scope: 'project', values: { providers: { sources } } }])
            .values,
          registry,
          declarations,
          path: '',
        })
      expect(build([]).angles).toEqual([])
      const configured = build(['support'])
      expect(configured.angles.map((angle) => angle.provider)).toEqual(['support'])
      expect(configured.angles.find((angle) => angle.provider === 'support')?.available).toBe(false)
      expect(
        build([], [{ target: 'codex', server: 'support', file: 'fixture', enabled: true }]).angles,
      ).toHaveLength(0)
      expect(build(['missing']).openQuestions[0]?.missing).toContain('no validated query provider')
    }))

  it.each([3, 5, 7, 9])(
    'drops only after the configured strict majority of %i active refutations',
    (verifiers) =>
      fixture((dir) => {
        const p = plan(dir, verifiers)
        const angle = p.angles[0]?.id ?? ''
        const id = `${angle}:claim-1`
        const threshold = Math.floor(verifiers / 2) + 1
        const votes = Array.from({ length: threshold - 1 }, (_, index) =>
          vote(id, index + 1, 'refute'),
        )
        expect(researchReport(p, [result(angle)], votes).claims).toHaveLength(1)
        votes.push(vote(id, threshold, 'refute'))
        expect(researchReport(p, [result(angle)], votes).dropped).toHaveLength(1)
        expect(researchReport(p, [result(angle)], []).claims[0]?.confidence).toBe('low')
        expect(researchReport(p, [], []).openQuestions).toHaveLength(p.angles.length)
      }),
  )

  it('never renders an unexamined claim as if verifiers had checked it', () =>
    fixture((dir) => {
      const p = plan(dir),
        angle = p.angles[0]?.id ?? '',
        examined = renderResearchBrief(p, researchReport(p, [result(angle)], [])),
        unexamined = renderResearchBrief(p, researchReport(p, [result(angle, false)], []))
      expect(examined).toContain(`active refutations: 0/${p.refutations}`)
      // Found by the first live EVAL-10 trial: both judges read the count as verification.
      expect(unexamined).not.toContain('active refutations')
      expect(unexamined).toContain('not load-bearing, so not independently examined')
    }))
  it.each([3, 5, 7, 9])(
    'keeps minority refutation disputed with all %i planned verifiers present',
    (verifiers) =>
      fixture((dir) => {
        const original = plan(dir, verifiers),
          first = original.angles[0]
        if (!first) throw new Error('A source angle is required')
        const p = { ...original, angles: [first] },
          source = result(first.id),
          id = `${first.id}:claim-1`,
          votes = Array.from({ length: verifiers }, (_, index) =>
            vote(id, index + 1, index === 0 ? 'refute' : 'confirm'),
          ),
          report = researchReport(p, [source], votes)
        expect(report.dropped).toEqual([])
        expect(report.claims[0]).toMatchObject({
          text: source.claims[0]?.text,
          confidence: 'low',
          refutations: 1,
        })
        expect(report.openQuestions).toHaveLength(1)
        expect(report.openQuestions[0]?.missing).toContain(votes[0]?.reason)
        expect(renderResearchBrief(p, report)).toContain('Confidence: low; active refutations: 1/')
        expect(source.claims[0]?.confidence).toBe('high')
      }),
  )
  it('rejects duplicate voters, unplanned angles and evidence-free refutations', () =>
    fixture((dir) => {
      const p = plan(dir)
      const angle = p.angles[0]?.id ?? ''
      const id = `${angle}:claim-1`
      expect(() =>
        researchReport(p, [result(angle)], [vote(id, 1, 'refute'), vote(id, 1, 'refute')]),
      ).toThrow('Duplicate verifier')
      expect(() => researchReport(p, [result(angle)], [vote(id, 4, 'refute')])).toThrow('outside')
      expect(() => researchReport(p, [result('unplanned')], [])).toThrow('unplanned')
      expect(() => validateRefutation({ ...vote(id, 1, 'refute'), evidence: [] })).toThrow(
        'needs evidence',
      )
      expect(
        researchReport(p, [result(angle)], [vote(id, 2, 'refute'), vote(id, 1, 'confirm')]),
      ).toEqual(researchReport(p, [result(angle)], [vote(id, 1, 'confirm'), vote(id, 2, 'refute')]))
      expect(() => validateRefutation({ ...vote(id, 1, 'refute'), reason: ' ' })).toThrow(
        'meaningful',
      )
      expect(() => researchReport(p, [result(angle, false)], [vote(id, 1, 'refute')])).toThrow(
        'Only load-bearing',
      )
    }))
})

describe('native and sequential research workflows', () => {
  it('preserves coverage and conclusions across engines while failed sources remain open questions', () =>
    fixture(async (dir) => {
      const p = plan(dir)
      let running = 0
      let maximum = 0
      const engine: ResearchEngine = {
        async investigate(angle) {
          running++
          maximum = Math.max(maximum, running)
          await new Promise((done) => setTimeout(done, 2))
          running--
          if (angle.provider === 'native-web') throw new Error('Fixture provider unreachable')
          return result(angle.id)
        },
        async challenge(claim, verifier) {
          if (verifier === 3) throw new Error('Fixture verifier silent')
          return vote(claim, verifier, verifier === 1 ? 'refute' : 'confirm')
        },
      }
      const sink = { submit: (_result: AngleResult) => {}, examine: (_vote: Refutation) => {} }
      const native = await runResearch(p, engine, sink)
      expect(maximum).toBe(2)
      maximum = 0
      const sequential = await runResearch(p, engine, sink, 'sequential')
      expect(maximum).toBe(1)
      expect(native).toEqual(sequential)
      expect(native.claims).toHaveLength(1)
      expect(native.dropped).toHaveLength(0)
      expect(native.claims[0]?.confidence).toBe('low')
      expect(native.openQuestions.some((entry) => entry.missing.includes('native-web'))).toBe(true)
    }))

  it('journals a complete stubbed-agent workflow and rebuilds its brief byte for byte', () =>
    fixture(async (_dir, engine, workflow) => {
      const start = engine.begin('research', { input: 'Find evidence for search', owner: 'Alex' })
      const id = start.payload.subject?.id ?? ''
      expect(id).toMatch(/^brief-/)
      const p = workflow.plan(id, { sources: ['native-code', 'native-web'] })
      if (p.status !== 'planned') throw new Error('Expected selected research plan')
      expect(p.jobs).toHaveLength(p.angles.length)
      expect(p.jobs[0]).toMatchObject({
        question: p.question,
        returnTo: { role: 'conductor', channel: 'final-message' },
      })
      mkdirSync(join(engine.root, '.wholeloop'), { recursive: true })
      writeFileSync(
        join(engine.root, '.wholeloop/config.yml'),
        'version: 1\nresearch: {verifiers: 5}\n',
      )
      const before = engine.store.events()
      expect(workflow.plan(id)).toEqual(p)
      expect(engine.store.events()).toEqual(before)
      const worker: ResearchEngine = {
        investigate: async (angle, _plan, assignment) => {
          expect(assignment?.input.angle).toBe(angle.id)
          expect(assignment?.question).toBe(p.question)
          return result(angle.id)
        },
        challenge: async (claim, verifier, _plan, assignment) => {
          expect(assignment?.input.claim.id).toBe(claim)
          expect(assignment?.input.verifier).toBe(verifier)
          expect(assignment?.input).not.toHaveProperty('votes')
          return vote(claim, verifier, verifier <= 2 ? 'refute' : 'confirm')
        },
      }
      await runResearch(p, worker, {
        submit: (value) => {
          workflow.submit(id, value)
        },
        examine: (value) => {
          workflow.examine(id, value)
        },
      })
      expect(() => workflow.submit(id, result(p.angles[0]?.id ?? ''))).toThrow(
        'already has a result',
      )
      expect(() =>
        engine.complete(
          'research',
          id,
          '## Question\nForged\n## Owner\nAlex\n## Claims\nMade up\n## Dropped claims\nNone\n## Open questions\nNone',
        ),
      ).toThrow('aggregated report')
      const completed = workflow.complete(id)
      expect(completed.report.dropped).toHaveLength(p.angles.length)
      expect(completed.report.claims).toHaveLength(0)
      const brief = engine.store.files.read(completed.receipt.artifact)
      expect(brief).toContain('active refutations: 2/2')
      engine.store.rebuild()
      expect(engine.store.files.read(completed.receipt.artifact)).toBe(brief)
      expect(() => workflow.examine(id, vote('unknown', 1, 'refute'))).toThrow('Begin research')
      engine.begin('research', { subject: id, input: 'A revised research question' })
      expect(workflow.plan(id, { sources: ['native-code', 'native-web'] })).toMatchObject({
        question: 'A revised research question',
        verifiers: 5,
      })
    }))

  it('supports an attached brief and prevents a mismatched research subject', () =>
    fixture((_dir, engine) => {
      const initiative =
        engine.begin('frame-problem', { input: 'Search', owner: 'Alex' }).payload.subject?.id ?? ''
      expect(() => engine.begin('research', { subject: initiative })).toThrow('use --parent')
      const brief =
        engine.begin('research', { input: 'Why search?', parent: initiative }).payload.subject
          ?.id ?? ''
      expect(engine.store.get(brief)).toMatchObject({
        kind: 'brief',
        parent: initiative,
        owner: 'Alex',
      })
    }))

  it('executes the research CLI with unavailable sources and records an honest brief', () =>
    fixture((dir) => {
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
        WL_WORKSPACE: '',
      }
      const cli = (...args: string[]) => {
        const processResult = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), ...args, '--json'],
          { cwd: dir, env, encoding: 'utf8' },
        )
        expect(processResult.status).toBe(0)
        return JSON.parse(processResult.stdout)
      }
      const id = cli('step', 'begin', 'research', '--input', 'Why search?', '--owner', 'Alex')
        .subject.id
      expect(cli('research', 'plan', '--for', id).status).toBe('needs-sources')
      const p = cli(
        'research',
        'plan',
        '--for',
        id,
        '--sources',
        'native-code,native-web',
      ) as ResearchPlan
      for (const angle of p.angles) {
        const file = join(dir, 'result.json')
        writeFileSync(
          file,
          JSON.stringify({
            angle: angle.id,
            status: 'unavailable',
            claims: [],
            openQuestions: [],
            reason: 'Fixture host has no source tool',
          }),
        )
        cli('research', 'submit', '--for', id, '--file', file)
      }
      const completed = cli('research', 'complete', '--for', id)
      expect(completed.report.claims).toEqual([])
      expect(completed.report.openQuestions).toHaveLength(p.angles.length)
      expect(
        readFileSync(join(dir, 'cli-state/wholeloop', completed.receipt.artifact), 'utf8'),
      ).toContain('Fixture host has no source tool')
    }))
})
