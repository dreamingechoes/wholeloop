import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { COMMANDS } from '../../../src/cli/commands.js'
import { experienceReport } from '../../../src/experience/report.js'
import { experienceTrace } from '../../../src/experience/transcript.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import {
  FRAME_REVIEW_COVERAGE,
  type FrameReview,
  frameDigest,
} from '../../../src/framing/finalize.js'
import { scratchDirectory } from '../../../src/fs/scratch.js'
import type { GatePlan } from '../../../src/gates/contracts.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { streamInputProblems } from '../../../src/harness/communication.js'
import { StateStore } from '../../../src/state/store.js'

const bin = resolve('dist/wl.mjs'),
  artifact = readFileSync('test/fixtures/framing/frame.md', 'utf8'),
  decision = {
    schema: 'wholeloop/frame-decision@1',
    by: 'Fixture Owner',
    outcome: 'on-hold',
    reason: 'Evidence is missing.',
    reopen: 'Observed evidence is available.',
    stopConditions: ['Pause until evidence is available.'],
  }
interface Payload {
  schema: string
  message: string
  run: string
  scratch: string
  recorded: boolean
  subject: { id: string }
  artifact: { content: string; sha256: string }
  reviewTemplate: FrameReview
  plan?: { status: string; assignments?: unknown }
  display: { text: string }
}
function framingSchemas(payload: ReturnType<FlowEngine['begin']>['payload']) {
  return 'inputSchemas' in payload ? payload.inputSchemas : undefined
}
function fixture(
  check: (value: {
    dir: string
    repo: string
    engine: FlowEngine
    cli: (args: string[], input?: string) => { code: number | null; payload: Payload; text: string }
  }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-step-input-')),
    repo = join(dir, 'repo')
  mkdirSync(repo)
  const engine = new FlowEngine(
      new StateStore(join(dir, 'state', 'wholeloop')),
      repo,
      join(dir, 'config', 'wholeloop', 'config.yml'),
      join(dir, 'home'),
    ),
    env = {
      ...process.env,
      HOME: join(dir, 'home'),
      XDG_STATE_HOME: join(dir, 'state'),
      XDG_CONFIG_HOME: join(dir, 'config'),
      WL_WORKSPACE: '',
      NO_COLOR: '1',
    }
  const cli = (args: string[], input?: string) => {
    const result = spawnSync(process.execPath, [bin, ...args, '--json'], {
      cwd: repo,
      env,
      encoding: 'utf8',
      ...(input === undefined ? {} : { input }),
    })
    expect(result.error).toBeUndefined()
    return {
      code: result.status,
      payload: JSON.parse(result.stdout || '{}') as Payload,
      text: result.stdout + result.stderr,
    }
  }
  try {
    check({ dir, repo, engine, cli })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe.each(['file', 'stdin'] as const)('%s small step payloads', (mode) => {
  it('uses the same framing decision and final-review schemas on exact final bytes', () =>
    fixture(({ dir, engine, cli }) => {
      const begun = engine.begin('frame-problem', {
          input: 'Search tasks',
          owner: 'Fixture Owner',
        }),
        id = begun.payload.subject?.id ?? '',
        draft = join(dir, 'draft.md'),
        file = join(dir, 'decision.json')
      expect(framingSchemas(begun.payload)?.decision.$id).toBe('wholeloop/frame-decision@1')
      expect(framingSchemas(begun.payload)?.review.$id).toBe('wholeloop/frame-review@1')
      writeFileSync(draft, artifact)
      writeFileSync(file, JSON.stringify(decision))
      const prepared = cli(
        [
          'frame',
          'draft',
          '--for',
          id,
          '--artifact',
          draft,
          ...(mode === 'stdin' ? ['--stdin'] : ['--file', file]),
        ],
        JSON.stringify(decision),
      )
      expect(prepared.code).toBe(0)
      const content = prepared.payload.artifact.content
      writeFileSync(draft, content)
      const review = {
        ...prepared.payload.reviewTemplate,
        reviewer: {
          by: 'Fixture Challenger',
          sha256: frameDigest(content),
          coverage: [...FRAME_REVIEW_COVERAGE],
          unresolvedFindings: [],
        },
      }
      writeFileSync(file, JSON.stringify(review))
      const completed = cli(
        [
          'frame',
          'finalize',
          '--for',
          id,
          '--artifact',
          draft,
          ...(mode === 'stdin' ? ['--stdin'] : ['--file', file]),
        ],
        JSON.stringify(review),
      )
      expect(completed.code).toBe(0)
      expect(engine.store.get(id).status).toBe('closed')
    }))
  it('records a worker result and an independent vote under the same current gate snapshot', () =>
    fixture(({ dir, repo, engine, cli }) => {
      const git = (...args: string[]) => {
        const result = spawnSync(
          'git',
          [
            '-c',
            'core.hooksPath=/dev/null',
            '-c',
            'commit.gpgsign=false',
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.invalid',
            ...args,
          ],
          { cwd: repo, encoding: 'utf8' },
        )
        expect(result.status, result.stderr).toBe(0)
      }
      git('init', '-q', '-b', 'main')
      writeFileSync(join(repo, 'source.txt'), 'Synthetic source.\n')
      git('add', '.')
      git('commit', '-qm', 'chore: create fixture')
      const subject = engine.store.create({
          kind: 'review',
          title: 'Fixture review',
          owner: 'Fixture Owner',
          body: '',
        }).id,
        plan: GatePlan = {
          schema: 'wholeloop/gate-round@1',
          subject,
          run: 'gate-0000000000000001',
          gate: 'review',
          round: 1,
          budget: 3,
          policy: 'a'.repeat(64),
          repository: repo,
          base: { ref: 'main', sha: 'b'.repeat(40) },
          snapshot: workspaceSnapshot(repo),
          inputs: { paths: [], languages: [], slots: [] },
          excluded: [],
          verifiers: 3,
          refutations: 2,
          units: [
            {
              id: 'fixture',
              lens: 'fixture',
              asks: 'Check the source.',
              prompt: 'Synthetic review.',
              failSafe: false,
              origin: 'fixture',
            },
          ],
        }
      engine.store.transaction((_events, append) =>
        append(subject, { type: 'gate.planned', data: { plan } }),
      )
      const inputs = [
        {
          run: plan.run,
          round: 1,
          result: {
            unit: 'fixture',
            status: 'ok',
            evidence: ['source.txt:1'],
            findings: [
              {
                id: 'issue',
                location: 'source.txt:1',
                text: 'Fixture finding.',
                evidence: ['source.txt:1'],
              },
            ],
          },
        },
        {
          run: plan.run,
          round: 1,
          vote: {
            finding: 'fixture:issue',
            verifier: 1,
            outcome: 'uncertain',
            reason: 'No independent proof.',
            evidence: [],
          },
        },
      ]
      for (const input of inputs) {
        const file = join(dir, 'result.json')
        writeFileSync(file, JSON.stringify(input))
        const result = cli(
          [
            'gate',
            'submit',
            '--for',
            subject,
            ...(mode === 'stdin' ? ['--stdin'] : ['--file', file]),
          ],
          JSON.stringify(input),
        )
        expect(result.code, result.text).toBe(0)
        expect(result.payload.recorded).toBe(true)
      }
      expect(
        engine.store
          .events()
          .filter(({ type }) => type === 'gate.submitted' || type === 'gate.examined'),
      ).toHaveLength(2)
    }))
  it('retains normalized observation validation without starting a hosted operation', () =>
    fixture(({ dir, cli }) => {
      const input = { schema: 'wholeloop/sync-observations@1', observations: [] },
        file = join(dir, 'observation.json')
      writeFileSync(file, JSON.stringify(input))
      const result = cli(
        ['sync', '--prune', 'off', ...(mode === 'stdin' ? ['--stdin'] : ['--file', file])],
        JSON.stringify(input),
      )
      expect(result.code, result.text).toBe(0)
      expect(result.payload.schema).toBe('wholeloop/sync@1')
    }))
})

describe('bounded streamed step inputs', () => {
  it('refuses conflicting modes, malformed JSON, empty input and oversize streams without echoing contents or mutating state', () =>
    fixture(({ dir, engine, cli }) => {
      const file = join(dir, 'legacy.json')
      writeFileSync(file, '{}')
      for (const [args, input] of [
        [['--stdin', '--file', file], '{}'],
        [['--stdin'], 'PRIVATE_INPUT_INVALID'],
        [['--stdin'], ''],
        [['--stdin'], `PRIVATE_INPUT${'x'.repeat(1024 * 1024 + 1 - 'PRIVATE_INPUT'.length)}`],
      ] as [string[], string][]) {
        const result = cli(['gate', 'submit', '--for', 'review-00000001', ...args], input)
        expect(result.code).not.toBe(0)
        expect(result.text).not.toContain('PRIVATE_INPUT')
        expect(engine.store.events()).toEqual([])
      }
      const fileResult = cli(['gate', 'submit', '--for', 'review-00000001', '--file', file]),
        streamed = cli(['gate', 'submit', '--for', 'review-00000001', '--stdin'], '{}')
      expect(streamed.payload).toEqual(fileResult.payload)
    }))
  it('refuses payload/rationale stdin conflicts before either stream is consumed', () =>
    fixture(({ cli, engine }) => {
      const result = cli(
        [
          'frame',
          'finalize',
          '--for',
          'init-00000001',
          '--artifact',
          'unused.md',
          '--stdin',
          '--rationale-stdin',
        ],
        'PRIVATE_INPUT',
      )
      expect(result.code).toBe(2)
      expect(result.payload.message).toContain('cannot both consume')
      expect(result.text).not.toContain('PRIVATE_INPUT')
      expect(engine.store.events()).toEqual([])
    }))
  it('preserves a literal dash filename and the existing smaller framing limit', () =>
    fixture(({ dir, repo, engine, cli }) => {
      const id =
          engine.begin('frame-problem', { input: 'Search', owner: 'Fixture Owner' }).payload.subject
            ?.id ?? '',
        draft = join(dir, 'draft.md')
      writeFileSync(draft, artifact)
      writeFileSync(join(repo, '-'), JSON.stringify(decision))
      expect(cli(['frame', 'draft', '--for', id, '--artifact', draft, '--file', '-']).code).toBe(0)
      expect(
        cli(['frame', 'draft', '--for', id, '--artifact', draft, '--stdin'], 'x'.repeat(65537))
          .code,
      ).not.toBe(0)
    }))
  it('combines research begin and its first plan without bypassing questions or changing replay', () =>
    fixture(({ engine, cli }) => {
      const missing = cli([
        'step',
        'begin',
        'research',
        '--with-plan',
        '--input',
        'Why does title search fail?',
      ])
      expect(missing.code).toBe(2)
      expect(missing.payload.plan).toBeUndefined()
      expect(engine.store.events()).toEqual([])
      const begun = cli([
        'step',
        'begin',
        'research',
        '--with-plan',
        '--input',
        'Why does title search fail?',
        '--owner',
        'Fixture Owner',
        '--client',
        'codex',
      ])
      expect(begun.code, begun.text).toBe(0)
      expect(begun.payload.plan?.status).toBe('needs-sources')
      expect(begun.payload.plan?.assignments).toBeUndefined()
      expect(begun.payload.display.text).toContain('sources')
      const scratch = begun.payload.scratch,
        before = engine.store.events()
      expect(scratch).toBe(scratchDirectory(engine.store.files.root, begun.payload.run))
      expect(scratch.startsWith(engine.store.files.root)).toBe(false)
      expect(existsSync(scratch)).toBe(false)
      const resumed = cli([
        'step',
        'begin',
        'research',
        '--with-plan',
        '--for',
        begun.payload.subject.id,
        '--client',
        'codex',
      ])
      expect(resumed.code).toBe(0)
      expect(resumed.payload.scratch).toBe(scratch)
      expect(engine.store.events()).toEqual(before)
      expect(cli(['step', 'begin', 'frame-problem', '--with-plan']).code).toBe(2)
    }))
  it('refuses artifact paths inside the private store or a repository without creating them', () =>
    fixture(({ repo, engine }) => {
      mkdirSync(join(repo, '.git'))
      for (const temporary of [
        engine.store.files.root,
        join(engine.store.files.root, '..hidden'),
        repo,
      ])
        expect(() =>
          scratchDirectory(engine.store.files.root, 'run-0000000000000001', temporary),
        ).toThrow()
    }))
  it('returns framing schemas only when ready and prevents caller mutation from changing validation', () =>
    fixture(({ engine }) => {
      const missing = engine.begin('frame-problem', { input: 'Search tasks' })
      expect(missing.code).toBe(2)
      expect(framingSchemas(missing.payload)).toBeUndefined()
      expect(engine.store.events()).toEqual([])
      const first = engine.begin('frame-problem', {
          input: 'Search tasks',
          owner: 'Fixture Owner',
        }),
        schemas = framingSchemas(first.payload)
      if (!schemas) throw new Error('Expected ready framing schemas')
      schemas.decision.required.length = 0
      const resumed = engine.begin('frame-problem', { subject: first.payload.subject?.id ?? '' })
      expect(framingSchemas(resumed.payload)?.decision.required).toContain('stopConditions')
    }))
  it('uses stdin only on commands whose registered contract declares it', () => {
    const commands = [...COMMANDS].sort((a, b) => b.path.length - a.path.length)
    for (const [file, text] of bundledCanonical())
      if (/harness\/(?:skills|protocols)\//.test(file))
        for (const match of text.matchAll(/`([^`]+)`/g)) {
          const value = (match[1] ?? '').replace(/\s+/g, ' ').trim()
          if (!value.startsWith('wl ') || !/(?:^| )--stdin(?: |$)/.test(value)) continue
          const command = commands.find(
            ({ path }) => value === `wl ${path}` || value.startsWith(`wl ${path} `),
          )
          expect(command?.options, `${file}: ${value}`).toContain('--stdin')
        }
  })
  it('shows the same compound preparation and quiet input policy in all seven clients', () => {
    for (const adapter of ADAPTERS) {
      const rendered = generateAdapter(
          adapter.id,
          bundledCanonical(),
          '#!/usr/bin/env node\n',
          '0.0.0',
        ),
        research = rendered.files.get(adapter.paths('skill', 'research'))?.content ?? '',
        review = rendered.files.get(adapter.paths('skill', 'review-code'))?.content ?? ''
      expect(research, adapter.id).toContain('--with-plan')
      expect(research).toContain('--stdin')
      expect(review).toContain('returned by begin')
    }
  })
  it('rejects reintroduced JSON scratch instructions while preserving large artifact inputs', () => {
    expect(streamInputProblems('Use `wl gate submit --file <result.json>`')).toHaveLength(1)
    expect(streamInputProblems('Use `wl frame draft --artifact <draft.md> --stdin`')).toEqual([])
    expect(streamInputProblems('Use `wl challenge plan problem --file <draft.md>`')).toEqual([])
    for (const [file, text] of bundledCanonical())
      if (/harness\/(?:skills|protocols)\//.test(file))
        expect(streamInputProblems(text), file).toEqual([])
  })
  it('counts reduced bookkeeping calls from synthetic reference-client-shaped transcripts', () => {
    const reports = ['before', 'after'].map((name) =>
      experienceReport(
        experienceTrace(
          JSON.parse(readFileSync(`test/fixtures/experience/bookkeeping-${name}.json`, 'utf8')),
        ),
      ),
    )
    expect(reports.map(({ toolCalls }) => toolCalls)).toEqual([4, 2])
    expect(reports.every(({ provenance }) => provenance === 'synthetic')).toBe(true)
  })
})
