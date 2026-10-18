import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { setup } from '../../../src/utilities/setup.js'

interface Payload {
  schema: string
  questions: { id: string; options: unknown[] }[]
  contract: { subject: { id: string }; run: string; step: string; available: boolean }
  receipt: { produced: string }
  items: { id: string; title: string; owner: string }[]
  artifacts: unknown[]
  messages: unknown[]
  unreadCount: number
  action: unknown
  values: { profile: { preset: string } }
}

function fixture(
  run: (dir: string, cli: (...args: string[]) => { code: number | null; payload: Payload }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-utilities-'))
  const bin = resolve('dist/wl.mjs')
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, 'config'),
    XDG_STATE_HOME: join(dir, 'state'),
    WL_WORKSPACE: '',
  }
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [bin, ...args, '--json'], {
      env,
      cwd: dir,
      encoding: 'utf8',
    })
    expect(result.stderr).toBe('')
    return { code: result.status, payload: JSON.parse(result.stdout) }
  }
  try {
    run(dir, cli)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function files(root: string): Record<string, string> {
  if (!existsSync(root)) return {}
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name)
        return [path, readFileSync(path, 'utf8')]
      }),
  )
}

describe('minimal local skill workflow', () => {
  it('routes a sentence through framing and a receipt, then stops at the unavailable next step', () =>
    fixture((dir, cli) => {
      const missing = cli('next', 'Find old orders')
      expect(missing.code).toBe(2)
      expect(missing.payload.questions.map((question: { id: string }) => question.id)).toEqual([
        'owner',
      ])
      expect(cli('state', 'list').payload.items).toEqual([])
      const begun = cli('next', 'Find old orders', '--owner', 'Alex')
      expect(begun.code).toBe(0)
      const id = begun.payload.contract.subject.id
      expect(id).toMatch(/^init-[a-f0-9]{8}$/)
      expect(cli('next', id).payload.contract.run).toBe(begun.payload.contract.run)
      expect(cli('next').payload.contract.subject.id).toBe(id)
      const artifact = join(dir, 'frame.md')
      writeFileSync(
        artifact,
        readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8'),
      )
      const completed = cli(
        'step',
        'complete',
        'frame-problem',
        '--for',
        id,
        '--artifact',
        artifact,
      )
      expect(completed.code).toBe(0)
      expect(completed.payload.receipt.produced).toContain(id)
      const next = cli('next', id)
      expect(next.code).toBe(3)
      expect(next.payload.contract.step).toBe('write-spec')
      expect(next.payload.contract.available).toBe(false)
      expect(cli('state', 'list').payload.items).toHaveLength(1)
      const before = files(join(dir, 'state'))
      const status = cli('status', id)
      expect(status.payload.items[0]).toMatchObject({ id, title: 'Find old orders', owner: 'Alex' })
      expect(files(join(dir, 'state'))).toEqual(before)
      expect(cli('resume', id).payload.artifacts).toHaveLength(1)
      cli('state', 'rebuild')
      expect(files(join(dir, 'state'))).toEqual(before)
    }))

  it('asks about multiple items and pending human decisions without choosing or mutating', () =>
    fixture((dir, cli) => {
      const one = cli('next', 'First idea', '--owner', 'Alex').payload.contract.subject.id
      cli('next', 'Second idea', '--owner', 'Alex')
      const before = files(join(dir, 'state'))
      const choice = cli('next')
      expect(choice.code).toBe(2)
      expect(choice.payload.questions[0]?.options).toHaveLength(2)
      expect(files(join(dir, 'state'))).toEqual(before)
      cli('step', 'skip', 'write-spec', '--for', one, '--reason', 'Existing spec needs approval')
      const decision = cli('next', one)
      expect(decision.code).toBe(2)
      expect(decision.payload.questions[0]?.id).toBe('decision.approve-spec')
      expect(decision.payload.action).toBeNull()
      expect(
        cli('answer', 'decision.approve-spec=approved', '--for', one, '--by', 'Alex').code,
      ).toBe(0)
      expect(cli('next', one).payload.contract.step).toBe('frame-problem')
      expect(cli('next', 'https://example.com/spec').code).toBe(3)
    }))

  it('keeps status read-only with unread messages and an empty store', () =>
    fixture((dir, cli) => {
      expect(cli('status').payload.items).toEqual([])
      expect(existsSync(join(dir, 'state'))).toBe(false)
      const id = cli('next', 'Search', '--owner', 'Alex').payload.contract.subject.id
      cli(
        'msg',
        'send',
        '--thread',
        id,
        '--to',
        'conductor',
        '--kind',
        'note',
        '--body',
        'Evidence available',
      )
      const before = files(join(dir, 'state'))
      expect(cli('status').payload.unreadCount).toBe(1)
      expect(cli('status', id).payload.unreadCount).toBe(1)
      expect(cli('msg', 'read', '--for', 'conductor', '--peek').payload.messages).toHaveLength(1)
      expect(files(join(dir, 'state'))).toEqual(before)
    }))
})

describe('explicit scoped setup', () => {
  it('batches missing choices and scopes before writing and preserves unrelated settings', () =>
    fixture((dir, cli) => {
      const questions = cli('setup')
      expect(questions.code).toBe(2)
      expect(questions.payload.questions.map((question: { id: string }) => question.id)).toEqual([
        'profile',
        'docs',
        'tracker',
        'scope',
      ])
      expect(cli('setup', '--profile', 'mentor').code).toBe(2)
      expect(existsSync(join(dir, 'config'))).toBe(false)
      const config = join(dir, 'config/wholeloop/config.yml')
      mkdirSync(join(dir, 'config/wholeloop'), { recursive: true })
      writeFileSync(
        config,
        'version: 1\nprofile: {language: es}\nslots: {verify.suite: npm test}\n',
      )
      const applied = cli(
        'setup',
        '--profile',
        'mentor',
        '--docs',
        'local-docs',
        '--tracker',
        'local-tracker',
        '--scope',
        'user',
      )
      expect(applied.code).toBe(0)
      expect(applied.payload).toMatchObject({
        applied: true,
        scope: 'user',
        values: {
          profile: { preset: 'mentor', language: 'es' },
          providers: { docs: 'local-docs', tracker: 'local-tracker' },
          slots: { 'verify.suite': 'npm test' },
        },
      })
      const before = readFileSync(config, 'utf8')
      expect(cli('setup', '--profile', 'autopilot', '--scope', 'run').payload).toMatchObject({
        applied: false,
        file: null,
        values: { profile: { preset: 'autopilot' } },
      })
      expect(readFileSync(config, 'utf8')).toBe(before)
      const project = cli('setup', '--profile', 'pair', '--scope', 'project')
      expect(project.code).toBe(0)
      expect(project.payload.values.profile.preset).toBe('mentor')
      expect(readFileSync(join(dir, '.wholeloop/config.yml'), 'utf8')).toContain('preset: pair')
    }))

  it('validates every selection before committing a settings batch', () =>
    fixture((dir) => {
      const userFile = join(dir, 'config.yml')
      expect(() =>
        setup(dir, { scope: 'user', profile: 'mentor', docs: 'missing' }, userFile),
      ).toThrow('No configured provider supports docs.create')
      expect(existsSync(userFile)).toBe(false)
      expect(() =>
        setup(dir, { scope: 'user', profile: 'missing', docs: 'local-docs' }, userFile),
      ).toThrow('Unknown profile')
      expect(existsSync(userFile)).toBe(false)
    }))

  it('keeps canonical skill and agent resources within their portable contracts', () => {
    const root = resolve('.')
    const result = execFileSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'harness', 'check', '--json'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(JSON.parse(result).findings).toEqual([])
    for (const name of ['next', 'status', 'setup', 'frame-problem'])
      expect(readFileSync(join(root, `harness/skills/${name}/SKILL.md`), 'utf8')).toContain('wl ')
  })
})
