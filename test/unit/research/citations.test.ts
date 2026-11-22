// Real disposable Git histories prove literal citations without trusting the checkout or model prose.
import { spawnSync } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { excerptHash } from '../../../src/research/citation-proof.js'
import { CITATION_FILE_BYTES, checkCodeCitations } from '../../../src/research/citations.js'
import type { AngleResult } from '../../../src/research/contracts.js'
import { researchState } from '../../../src/research/report.js'
import { ResearchWorkflow } from '../../../src/research/workflow.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(action: (context: ReturnType<typeof setup>) => void, sha256 = false) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-code-citations-')),
    path = process.env.PATH
  try {
    action(setup(dir, sha256))
  } finally {
    if (path === undefined) delete process.env.PATH
    else process.env.PATH = path
    rmSync(dir, { recursive: true, force: true })
  }
}
function setup(dir: string, sha256: boolean) {
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const realGit = (process.env.PATH ?? '')
    .split(delimiter)
    .map((entry) => join(entry, 'git'))
    .find((file) => {
      try {
        accessSync(file, constants.X_OK)
        return true
      } catch {
        return false
      }
    })
  if (!realGit) throw new Error('Fixture needs Git')
  const git = (...args: string[]) => {
    const result = spawnSync(
      realGit,
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        ...args,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: join(dir, 'no-global'),
        },
      },
    )
    if (result.status !== 0) throw new Error(`Fixture Git failed: ${result.stderr}`)
    return result.stdout.trim()
  }
  const put = (path: string, body: string | Buffer) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  git('init', '-b', 'main', ...(sha256 ? ['--object-format=sha256'] : []))
  put('src/example.ts', 'export const answer = 42\nexport function empty() {\n  return 400\n}\n')
  put('folder with spaces/café.ts', 'alpha\r\nbeta\r\n')
  git('add', '.')
  git(
    'commit',
    '-m',
    'test: seed citation fixture',
    '-m',
    'Pin literal source text for deterministic reference checks.',
  )
  const commit = git('rev-parse', 'HEAD')
  const result = (ref = `src/example.ts:1-4@${commit}`, excerpt = 'return 400'): AngleResult => ({
    angle: 'native-code:source.code',
    status: 'ok',
    claims: [
      {
        id: 'empty-input',
        text: 'Empty input returns status 400.',
        confidence: 'high',
        loadBearing: true,
        evidence: [{ ref, excerpt }],
      },
    ],
    openQuestions: [],
  })
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state/wholeloop')),
    root,
    join(dir, 'config/wholeloop/config.yml'),
    join(dir, 'home'),
  )
  const workflow = new ResearchWorkflow(engine)
  const begin = () => {
    const id =
      engine.begin('research', { input: 'Where is empty input handled?', owner: 'Fixture Owner' })
        .payload.subject?.id ?? ''
    const plan = workflow.plan(id, { sources: ['native-code'], env: {}, path: '' })
    if (plan.status !== 'planned') throw new Error('Expected selected research plan')
    return { id, plan }
  }
  const proxy = (reject = false) => {
    const bin = join(dir, 'bin'),
      log = join(dir, 'git-calls.ndjson')
    mkdirSync(bin, { recursive: true })
    const code = `#!${process.execPath}\nconst fs=require('node:fs'), cp=require('node:child_process'); let input=''; process.stdin.on('data', b=>input+=b); process.stdin.on('end',()=>{fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args:process.argv.slice(2),input})+'\\n'); ${reject ? "console.error('private-fixture-error-do-not-emit'); process.exit(129);" : `const r=cp.spawnSync(${JSON.stringify(realpathSync(realGit))},process.argv.slice(2),{input,env:process.env}); if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);process.exit(r.status??1);`} });\n`
    writeFileSync(join(bin, 'git'), code)
    chmodSync(join(bin, 'git'), 0o755)
    process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ''}`
    return log
  }
  return { dir, root, git, put, commit, result, engine, workflow, begin, proxy }
}

it('checks an actual SHA-256 Git repository with complete object IDs', () =>
  fixture(({ root, commit, result }) => {
    expect(commit).toHaveLength(64)
    expect(checkCodeCitations(root, result())).toMatchObject({
      problems: [],
      checks: [{ status: 'verified' }],
    })
  }, true))

it.each([
  ['valid', 'src/example.ts:1-4', 'return 400', ''],
  ['missing file', 'src/missing.ts:1', 'return 400', 'file is not'],
  ['wrong range', 'src/example.ts:1-99', 'return 400', 'line range'],
  ['wrong line', 'src/example.ts:1', 'return 400', 'excerpt does not match'],
  ['edited excerpt', 'src/example.ts:1-4', 'return 401', 'excerpt does not match'],
  ['spaces and CRLF', 'folder with spaces/café.ts:1-2', 'alpha\nbeta\n', ''],
] as const)('checks %s citations against the exact committed blob', (_name, ref, quote, error) =>
  fixture(({ root, result, commit }) => {
    const checked = checkCodeCitations(root, result(`${ref}@${commit}`, quote))
    if (error) {
      expect(checked.problems.join(' ')).toContain('Claim empty-input')
      expect(checked.problems.join(' ')).toContain(error)
      expect(checked.checks).toEqual([])
    } else {
      expect(checked.problems).toEqual([])
      expect(checked.checks).toMatchObject([
        { claim: 'empty-input', status: 'verified', excerptSha256: excerptHash(quote) },
      ])
    }
  }),
)

it.each([
  '../outside.ts:1',
  '/outside.ts:1',
  'src\\example.ts:1',
  'src/../example.ts:1',
  'src/example.ts:0',
  'src/example.ts:4-2',
  'src/\nexample.ts:1',
])('refuses unsafe or malformed %s before Git execution', (ref) =>
  fixture(({ root, commit, result, proxy }) => {
    const log = proxy(),
      checked = checkCodeCitations(root, result(`${ref}@${commit}`))
    expect(checked.problems.length).toBeGreaterThan(0)
    expect(existsSync(log)).toBe(false)
  }),
)

it('refuses abbreviated commits and non-commit objects, while preserving generic references as unchecked', () =>
  fixture(({ root, result, commit, git }) => {
    expect(
      checkCodeCitations(root, result(`src/example.ts:1@${commit.slice(0, 8)}`)).problems.join(' '),
    ).toContain('complete commit')
    const blob = git('rev-parse', 'HEAD:src/example.ts')
    expect(
      checkCodeCitations(root, result(`src/example.ts:1@${blob}`)).problems.join(' '),
    ).toContain('commit is not locally available')
    expect(checkCodeCitations(root, result('src/example.ts:3'))).toEqual({
      checks: [],
      problems: [],
    })
    expect(checkCodeCitations(root, result('https://example.com/code:1@version'))).toEqual({
      checks: [],
      problems: [],
    })
  }))

it('uses historical bytes and ignores replacement objects and checkout edits', () =>
  fixture(({ root, result, commit, git, put }) => {
    put('src/example.ts', 'export const changed = true\n')
    git('add', '.')
    git(
      'commit',
      '-m',
      'test: alter fixture',
      '-m',
      'Retain the original committed source for historical references.',
    )
    git('replace', commit, git('rev-parse', 'HEAD'))
    put('src/example.ts', 'uncommitted checkout text\n')
    expect(checkCodeCitations(root, result()).problems).toEqual([])
    expect(readFileSync(join(root, 'src/example.ts'), 'utf8')).toBe('uncommitted checkout text\n')
  }))

it('supports a current directory below the Git root without widening relative paths', () =>
  fixture(({ root, result, commit }) => {
    expect(
      checkCodeCitations(join(root, 'src'), result(`example.ts:3@${commit}`)).problems,
    ).toEqual([])
    expect(
      checkCodeCitations(join(root, 'src'), result(`../src/example.ts:3@${commit}`)).problems
        .length,
    ).toBeGreaterThan(0)
  }))

it('reads symlink blob text without following host targets and refuses non-text or oversized blobs', () =>
  fixture(({ dir, root, git, put, result }) => {
    const target = join(dir, 'outside-source.txt')
    writeFileSync(target, 'outside target contents')
    symlinkSync(target, join(root, 'link'))
    put('binary.ts', Buffer.from([0, 255, 1]))
    put('large.ts', 'x'.repeat(CITATION_FILE_BYTES + 1))
    git('add', '.')
    git(
      'commit',
      '-m',
      'test: add bounded object fixtures',
      '-m',
      'Observe link text and reject unreadable or oversized code sources.',
    )
    const sha = git('rev-parse', 'HEAD')
    expect(
      checkCodeCitations(root, result(`link:1@${sha}`, 'outside target contents')).problems.join(
        ' ',
      ),
    ).toContain('excerpt does not match')
    expect(checkCodeCitations(root, result(`link:1@${sha}`, target)).problems).toEqual([])
    for (const file of ['binary.ts', 'large.ts'])
      expect(
        checkCodeCitations(root, result(`${file}:1@${sha}`, 'x')).problems.join(' '),
      ).toContain('non-text or exceeds')
  }))

it('batches duplicate references into three guarded local Git calls and bounds reference count', () =>
  fixture(({ root, result, proxy }) => {
    const log = proxy(),
      value = result(),
      claim = value.claims[0]
    if (!claim) throw new Error('Expected claim')
    const evidence = claim.evidence[0]
    if (!evidence) throw new Error('Expected evidence')
    claim.evidence = Array.from({ length: 100 }, () => ({ ...evidence }))
    expect(checkCodeCitations(root, value).checks).toHaveLength(100)
    const calls = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(calls).toHaveLength(3)
    expect(
      calls.every(
        (call) =>
          call.args.includes('--no-lazy-fetch') && call.args.includes('--no-replace-objects'),
      ),
    ).toBe(true)
    expect(
      calls
        .filter((call) => call.args.includes('--batch-check'))[0]
        .input.trim()
        .split('\n'),
    ).toHaveLength(2)
    expect(
      calls
        .filter((call) => call.args.includes('--batch'))[0]
        .input.trim()
        .split('\n'),
    ).toHaveLength(1)
    claim.evidence = Array(257).fill(claim.evidence[0])
    expect(checkCodeCitations(root, value).problems.join(' ')).toContain('reference limit')
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(3)
  }))

it('does not run configured text conversions or checkout filters', () =>
  fixture(({ root, result, git, put }) => {
    put('.gitattributes', 'src/*.ts diff=forbidden filter=forbidden\n')
    git('add', '.gitattributes')
    git(
      'commit',
      '-m',
      'test: declare disabled conversions',
      '-m',
      'Keep object inspection independent of checkout and presentation filters.',
    )
    git('config', 'diff.forbidden.textconv', 'false')
    git('config', 'filter.forbidden.smudge', 'false')
    git('config', 'filter.forbidden.required', 'true')
    expect(checkCodeCitations(root, result()).problems).toEqual([])
  }))

it('bounds total unique blob bytes before requesting their contents', () =>
  fixture(({ root, result, git, put }) => {
    for (let index = 0; index < 5; index++)
      put(`large-${index}.ts`, 'x'.repeat(CITATION_FILE_BYTES - 1) + index)
    git('add', '.')
    git(
      'commit',
      '-m',
      'test: bound citation inputs',
      '-m',
      'Exercise distinct committed blobs without unbounded output reads.',
    )
    const sha = git('rev-parse', 'HEAD'),
      value = result(),
      claim = value.claims[0]
    if (!claim) throw new Error('Expected claim')
    claim.evidence = Array.from({ length: 5 }, (_, index) => ({
      ref: `large-${index}.ts:1@${sha}`,
      excerpt: 'x',
    }))
    const checked = checkCodeCitations(root, value)
    expect(checked.checks).toHaveLength(4)
    expect(checked.problems).toHaveLength(1)
    expect(checked.problems[0]).toContain('bounded object read')
  }))

it('does not fall back or expose tool error content when local-only Git is unavailable', () =>
  fixture(({ root, result, proxy }) => {
    const log = proxy(true),
      checked = checkCodeCitations(root, result())
    expect(checked.problems.join(' ')).toContain('no fetch or fallback')
    expect(checked.problems.join(' ')).not.toContain('private-fixture-error')
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(1)
  }))

it('rejects an invalid source result atomically and gives only core checks to the matching claim examiners', () =>
  fixture(({ root, commit, result, engine, workflow, begin, proxy }) => {
    const { id, plan } = begin(),
      before = engine.store.events()
    expect(plan.jobs[0]?.input.localCodeRevision).toMatchObject({ repository: root, commit })
    expect(() =>
      workflow.submit(id, result(`src/example.ts:1@${commit}`, 'invented excerpt')),
    ).toThrow('Claim empty-input')
    expect(engine.store.events()).toEqual(before)
    const submitted = workflow.submit(id, result())
    expect(submitted.codeCitations).toHaveLength(1)
    const next = workflow.plan(id)
    expect(next.examinations).toHaveLength(3)
    expect(next.examinations.every((job) => job.input.codeCitations?.length === 1)).toBe(true)
    const context = workflow.complete(id)
    if (!('report' in context)) throw new Error('Expected conclusion context')
    expect(context.report.claims[0]?.codeCitations).toHaveLength(1)
    expect(context.certainty?.confidence).toBe('low')
    expect(context.report.claims[0]?.examinations).toEqual([])
    const log = proxy(true)
    engine.store.rebuild()
    expect(workflow.plan(id).examinations).toHaveLength(3)
    expect(existsSync(log)).toBe(false)
  }))

it('refuses forged quotation receipts and source widening while leaving old input schemas intact', () =>
  fixture(({ result, engine, workflow, begin }) => {
    const { id, plan } = begin(),
      value = result()
    expect(() =>
      workflow.submit(id, { ...value, codeCitations: [{ status: 'verified' }] }),
    ).toThrow()
    const before = engine.store.events()
    expect(() =>
      engine.store.transaction((_events, append) => {
        append(id, { type: 'research.submitted', data: { run: plan.run, result: value } })
        append(id, {
          type: 'research.citations-checked',
          data: {
            run: plan.run,
            angle: value.angle,
            checks: [
              {
                claim: 'empty-input',
                evidence: 0,
                ref: value.claims[0]?.evidence[0]?.ref ?? '',
                excerptSha256: 'a'.repeat(64),
                status: 'verified',
              },
            ],
          },
        })
      }),
    ).toThrow('submitted quotation')
    expect(engine.store.events()).toEqual(before)
    const submitted = workflow.submit(id, value)
    expect(() =>
      engine.store.transaction((_events, append) =>
        append(id, {
          type: 'research.citations-checked',
          data: { run: plan.run, angle: value.angle, checks: submitted.codeCitations },
        }),
      ),
    ).toThrow('one earlier matching')
    const events = engine.store.events(),
      receipt = events.find((event) => event.type === 'research.citations-checked')
    if (receipt?.type !== 'research.citations-checked') throw new Error('Expected citation receipt')
    const forged = {
      ...receipt,
      data: {
        ...receipt.data,
        checks: receipt.data.checks.map((check) => ({ ...check, excerptSha256: 'b'.repeat(64) })),
      },
    }
    expect(() =>
      researchState(
        events.map((event) => (event.id === receipt.id ? forged : event)),
        id,
        plan.run,
      ),
    ).toThrow('submitted quotation')
    const web =
      engine.begin('research', { input: 'Web sources only', owner: 'Fixture Owner' }).payload
        .subject?.id ?? ''
    workflow.plan(web, { sources: ['native-web'], env: {}, path: '' })
    expect(() => workflow.submit(web, { ...value, angle: 'native-web:source.web' })).toThrow(
      'assigned source.code',
    )
  }))

it('cannot bind a receipt to a result that occurs later in the same transaction', () =>
  fixture(({ engine, begin, result }) => {
    const { id, plan } = begin(),
      value = result(),
      evidence = value.claims[0]?.evidence[0],
      before = engine.store.events()
    if (!evidence) throw new Error('Expected fixture evidence')
    expect(() =>
      engine.store.transaction((_events, append) => {
        append(id, {
          type: 'research.citations-checked',
          data: {
            run: plan.run,
            angle: value.angle,
            checks: [
              {
                claim: 'empty-input',
                evidence: 0,
                ref: evidence.ref,
                excerptSha256: excerptHash(evidence.excerpt),
                status: 'verified',
              },
            ],
          },
        })
        append(id, { type: 'research.submitted', data: { run: plan.run, result: value } })
      }),
    ).toThrow('one earlier matching')
    expect(engine.store.events()).toEqual(before)
  }))

it('keeps historical unproved submissions unchecked without opening Git on replay', () =>
  fixture(({ engine, workflow, begin, result, proxy, commit }) => {
    const { id, plan } = begin()
    engine.store.transaction((_events, append) =>
      append(id, {
        type: 'research.submitted',
        data: {
          run: plan.run,
          result: result(`src/example.ts:1@${commit}`, 'old unchecked quote'),
        },
      }),
    )
    const log = proxy(true)
    engine.store.rebuild()
    const next = workflow.plan(id)
    expect(next.examinations).toHaveLength(3)
    expect(next.examinations.every((job) => job.input.codeCitations === undefined)).toBe(true)
    expect(researchState(engine.store.events(), id, plan.run).citationChecks).toEqual([])
    expect(existsSync(log)).toBe(false)
  }))

it('checks the actual CLI before recording input and retains structured proof on success', () =>
  fixture(({ dir, root, result, commit, begin }) => {
    const { id } = begin(),
      cli = (value: AngleResult) => {
        const response = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'research', 'submit', '--for', id, '--stdin', '--json'],
          {
            cwd: root,
            input: JSON.stringify(value),
            encoding: 'utf8',
            env: {
              ...process.env,
              HOME: join(dir, 'home'),
              XDG_STATE_HOME: join(dir, 'state'),
              XDG_CONFIG_HOME: join(dir, 'config'),
              WL_WORKSPACE: '',
            },
          },
        )
        return { code: response.status, value: JSON.parse(response.stdout) }
      }
    expect(cli(result(`src/example.ts:1-99@${commit}`))).toMatchObject({
      code: 4,
      value: { message: expect.stringContaining('Claim empty-input') },
    })
    expect(cli(result())).toMatchObject({
      code: 0,
      value: { codeCitations: [{ claim: 'empty-input', status: 'verified' }] },
    })
  }))

it.each(ADAPTERS)(
  '$id keeps code citation context and structural checks separate from semantic quorum',
  (adapter) => {
    const generated = generateAdapter(
        adapter.id,
        bundledCanonical(),
        '#!/usr/bin/env node\n',
        '0.0.0',
      ),
      text = [...generated.files.values()].map((file) => file.content).join('\n')
    expect(text).toContain('file:start-end@full-commit-ID')
    expect(text).toContain('input.codeCitations')
    expect(text).toContain('change the planned quorum')
  },
)
