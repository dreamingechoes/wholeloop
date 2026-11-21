// Exercises explicit personal choices against real isolated homes, configuration and runtime stores.

import { spawnSync } from 'node:child_process'
import {
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
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDANCE_CLIENTS, personalFolders } from '../../../src/discovery/clients.js'
import { guidanceText } from '../../../src/discovery/content.js'
import { resolveSlot } from '../../../src/discovery/resolve.js'
import { runGuidance } from '../../../src/discovery/run.js'
import { scan } from '../../../src/discovery/scan.js'
import { discover } from '../../../src/discovery/tree.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { reviewRubric } from '../../../src/review/input.js'
import { withClientAttribution } from '../../../src/state/attribution-context.js'
import { StateStore } from '../../../src/state/store.js'

const skill = (name: string, description = 'Example guidance', slot?: string) =>
  `---\nname: ${name}\ndescription: ${description}\n${slot ? `metadata:\n  wholeloop.slot: ${slot}\n` : ''}---\n# Guidance\n\nKeep the requested behavior bounded.\n`
function fixture(
  run: (value: {
    root: string
    home: string
    dir: string
    engine: FlowEngine
    put: (path: string, text: string) => void
  }) => void,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-personal-guidance-')))
  const root = join(dir, 'repo'),
    home = join(dir, 'home')
  mkdirSync(root)
  mkdirSync(home)
  const put = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(home, '.config/wholeloop/config.yml'),
    home,
  )
  try {
    run({ root, home, dir, engine, put })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('personal guidance defaults', () => {
  it('ignores unrelated descriptions and suffixes across every build and research slot', () =>
    fixture(({ root, home, engine, put }) => {
      put(join(home, '.agents/skills/video/SKILL.md'), skill('video', 'A backend captioning tool'))
      put(
        join(home, '.agents/skills/writing/SKILL.md'),
        skill('writing', 'Review commits for essays'),
      )
      put(join(home, '.agents/skills/medical-research/SKILL.md'), skill('medical-research'))
      const inventory = discover(root, engine.store.files, home, {
        client: 'codex',
        persist: false,
      })
      for (const slot of [
        'research.method',
        'build.backend',
        'build.frontend',
        'build.mobile',
        'build.infra',
        'build.data',
        'build.design-system',
        'commit.convention',
      ]) {
        const result = resolveSlot(slot, inventory.repo, { user: inventory.user })
        expect(result.selected?.ref).toBe('default')
        expect(result.questions).toEqual([])
        expect(result.candidates).toEqual([])
      }
      const ignored = join(home, '.agents/skills/video/NOT_SKILL.md')
      put(ignored, 'Not guidance')
      const before = discover(root, engine.store.files, home, {
        client: 'codex',
        persist: false,
      }).fingerprint
      put(ignored, 'Changed non-guidance')
      expect(
        discover(root, engine.store.files, home, { client: 'codex', persist: false }).fingerprint,
      ).toBe(before)
      const result = engine.begin('research', {
        input: 'How does the module work?',
        owner: 'Example Owner',
        client: 'codex',
      })
      expect(result.code).toBe(0)
      expect(result.payload.questions).toEqual([])
    }))
  it.each(GUIDANCE_CLIENTS)(
    'reads only %s personal folders until another client is requested',
    (client) =>
      fixture(({ root, home, engine, put }) => {
        const folder = personalFolders(home, client).current[0]
        if (!folder) throw new Error('No personal folder')
        const file = join(folder, 'research', 'SKILL.md')
        put(file, skill('research'))
        const foreign = join(
          home,
          client === 'cursor'
            ? '.claude/skills/foreign/SKILL.md'
            : '.cursor/skills/foreign/SKILL.md',
        )
        put(foreign, '---\nmetadata:\n  wholeloop.slot: unknown.slot\n---\n')
        const inventory = withClientAttribution({ client, source: 'declared' }, () =>
          discover(root, engine.store.files, home, { persist: false }),
        )
        expect(inventory.user.assets.map((asset) => asset.path)).toEqual([file])
        expect(inventory.user.problems).toEqual([])
        expect(inventory.otherClients).toContainEqual(
          expect.objectContaining({
            label: 'configured for another client',
            path: dirname(dirname(foreign)),
          }),
        )
        const result = resolveSlot('research.method', inventory.repo, { user: inventory.user })
        expect(result.selected?.ref).toBe('default')
        expect(result.questions[0]?.required).toBe(false)
        expect(result.questions[0]?.options[0]?.value).toBe('default')
        expect(
          discover(root, engine.store.files, home, {
            client,
            includeOtherClients: true,
            persist: false,
          }).user.problems,
        ).toHaveLength(1)
      }),
  )
  it('uses native OpenCode, Copilot and plugin folders and an explicit configured directory', () =>
    fixture(({ root, home, dir, engine, put }) => {
      const cases = [
        ['opencode', join(home, '.config/opencode/skills/research/SKILL.md'), {}],
        ['copilot', join(home, '.copilot/skills/research/SKILL.md'), {}],
        [
          'antigravity',
          join(home, '.gemini/antigravity-cli/plugins/example/skills/research/SKILL.md'),
          {},
        ],
        [
          'claude',
          join(dir, 'custom/skills/research/SKILL.md'),
          { CLAUDE_CONFIG_DIR: join(dir, 'custom') },
        ],
      ] as const
      for (const [client, file, env] of cases) {
        put(file, skill('research'))
        const result = discover(root, engine.store.files, home, { client, env, persist: false })
        expect(result.user.assets.some((asset) => asset.path === file)).toBe(true)
      }
    }))
  it('walks shared physical personal folders once and keeps the current client reference first', () =>
    fixture(({ root, home, engine, put }) => {
      const folder = join(home, '.agents/skills')
      put(join(folder, 'research/SKILL.md'), skill('research'))
      mkdirSync(join(home, '.claude'))
      symlinkSync(folder, join(home, '.claude/skills'), 'dir')
      const result = discover(root, engine.store.files, home, {
        client: 'claude',
        includeOtherClients: true,
        persist: false,
      })
      expect(result.user.assets).toHaveLength(1)
      expect(result.user.assets[0]).toMatchObject({
        path: join(home, '.claude/skills/research/SKILL.md'),
        access: 'current-client',
      })
    }))
  it('does not scan personal files when the executing client is unknown', () =>
    fixture(({ root, home, engine, put }) => {
      put(join(home, '.agents/skills/research/SKILL.md'), skill('research'))
      expect(discover(root, engine.store.files, home, { persist: false }).user.assets).toEqual([])
    }))
  it('deduplicates copies by content with repository precedence', () => {
    const content = skill('backend')
    const user = scan(
      new Map([
        ['/example/.agents/skills/a/SKILL.md', content],
        ['/example/.codex/skills/b/SKILL.md', content],
      ]),
    )
    const personal = resolveSlot('build.backend', scan(new Map()), { user })
    expect(personal.candidates).toHaveLength(1)
    expect(personal.questions[0]?.options).toHaveLength(2)
    const repo = scan(new Map([['.agents/skills/backend/SKILL.md', content]]))
    expect(resolveSlot('build.backend', repo, { user }).candidates).toHaveLength(1)
  })
})

describe('remembered guidance choices', () => {
  it('does not reuse the identity of an already started run for another item', () =>
    fixture(({ engine }) => {
      const run = 'run-5555555555555555'
      const first = engine.begin('research', {
        input: 'Read title normalization',
        owner: 'Example Owner',
        run,
      })
      expect(first.code).toBe(0)
      expect(() =>
        engine.begin('research', { input: 'Another question', owner: 'Example Owner', run }),
      ).toThrow('already belongs')
    }))
  it('accepts a pre-step run choice through the built CLI without writing project configuration', () =>
    fixture(({ root, home, dir, put }) => {
      put(
        join(root, '.agents/skills/frame-problem/SKILL.md'),
        `${skill('frame-problem')}\nFirst guide.\n`,
      )
      put(
        join(root, '.claude/skills/frame-problem/SKILL.md'),
        `${skill('frame-problem')}\nSecond guide.\n`,
      )
      const env = {
        ...process.env,
        HOME: home,
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(home, '.config'),
        CODEX_HOME: join(home, '.codex'),
        CLAUDE_CONFIG_DIR: join(home, '.claude'),
        COPILOT_HOME: join(home, '.copilot'),
        OPENCODE_CONFIG_DIR: join(home, '.config/opencode'),
        GEMINI_CLI_HOME: home,
        WL_WORKSPACE: '',
      }
      const cli = (...args: string[]) =>
        spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          env,
          encoding: 'utf8',
          timeout: 15000,
        })
      const begin = [
        'step',
        'begin',
        'frame-problem',
        '--input',
        'Improve title normalization',
        '--owner',
        'Example Owner',
        '--client',
        'codex',
      ]
      const question = cli(...begin)
      expect(question.status).toBe(2)
      const run = (JSON.parse(question.stdout) as { run: string }).run
      expect(
        cli('answer', 'slot:frame.template=unoffered', '--remember', 'run', '--run', run).status,
      ).toBe(4)
      const answer = cli(
        'answer',
        'slot:frame.template=.agents/skills/frame-problem/SKILL.md',
        '--remember',
        'run',
        '--run',
        run,
      )
      expect(answer.status).toBe(0)
      expect((JSON.parse(answer.stdout) as { file: string }).file).toContain(
        join(dir, 'cli-state', 'wholeloop'),
      )
      expect(cli(...begin, '--run', run).status).toBe(0)
      expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
    }))
  it('validates offered values before writing any scope', () =>
    fixture(({ engine, root }) => {
      for (const scope of ['run', 'project', 'user'])
        expect(() =>
          engine.answer('slot:build.backend', '/unoffered/SKILL.md', {
            scope,
            run: 'run-1111111111111111',
          }),
        ).toThrow('offered')
      expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
      expect(existsSync(engine.userFile)).toBe(false)
    }))
  it('remembers an anonymous pre-step choice only for its supplied run and reports its file', () =>
    fixture(({ engine, root, put }) => {
      const first = '.agents/skills/frame-problem/SKILL.md'
      put(join(root, first), `${skill('frame-problem')}\nFirst guide.\n`)
      put(
        join(root, '.claude/skills/frame-problem/SKILL.md'),
        `${skill('frame-problem')}\nSecond guide.\n`,
      )
      const options = { input: 'Improve title normalization', owner: 'Example Owner' }
      const question = engine.begin('frame-problem', options)
      expect(question.code).toBe(2)
      const run = question.payload.run
      if (!run) throw new Error('Missing pre-step run ID')
      expect(engine.store.events()).toEqual([])
      const answer = engine.answer('slot:frame.template', first, { scope: 'run', run })
      expect('file' in answer && answer.file).toContain(engine.store.files.root)
      const started = engine.begin('frame-problem', { ...options, run })
      expect(started.code).toBe(0)
      expect(started.payload.bindings['frame.template']?.selected?.ref).toBe(first)
      expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
      expect(existsSync(engine.userFile)).toBe(false)
      expect(runGuidance(engine.store.files, root, 'run-2222222222222222')).toEqual({})
      expect(() => runGuidance(engine.store.files, join(root, 'another-repo'), run)).toThrow(
        'foreign',
      )
    }))
  it.each(['project', 'user'])(
    'reports the %s configuration file and remembers the default',
    (scope) =>
      fixture(({ engine, root, home, put }) => {
        put(join(home, '.agents/skills/research/SKILL.md'), skill('research'))
        const result = engine.answer('slot:research.method', 'default', { scope, client: 'codex' })
        expect('file' in result && result.file).toBe(
          scope === 'user' ? engine.userFile : join(root, '.wholeloop/config.yml'),
        )
        expect(
          engine.begin('research', {
            input: 'How does the module work?',
            owner: 'Example Owner',
            client: 'codex',
          }).payload.bindings['research.method']?.selected?.ref,
        ).toBe('default')
      }),
  )
  it('consumes a chosen personal review guide and then the explicit default for the same run', () =>
    fixture(({ engine, root, home, put }) => {
      const file = join(home, '.agents/skills/code-review/SKILL.md')
      put(file, skill('code-review'))
      const subject = engine.store.create({
        kind: 'review',
        title: 'Review titles',
        body: 'Review title normalization',
        owner: 'Example Owner',
        repository: root,
      }).id
      const run = 'run-3333333333333333'
      engine.store.transaction((_events, append) =>
        append(subject, {
          type: 'step.started',
          data: { step: 'review-code', run, mode: 'standalone', input: 'Review titles' },
        }),
      )
      engine.answer('slot:review.rubric', file, { scope: 'run', subject, client: 'codex' })
      expect(reviewRubric(engine, root, subject).content).toBe(readFileSync(file, 'utf8'))
      engine.answer('slot:review.rubric', 'default', { scope: 'run', subject })
      expect(reviewRubric(engine, root, subject).ref).toBe('default')
      expect(guidanceText(root, home, { ref: join(home, 'private.txt') })).toBeUndefined()
    }))
})
