import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { StateStore } from '../../../src/state/store.js'
import { allocatePorts } from '../../../src/worktrees/contracts.js'
import { repository } from '../../../src/worktrees/git.js'
import { WorktreeManager } from '../../../src/worktrees/manager.js'

function command(root: string, ...args: string[]) {
  const response = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(root, '.git/no-global-config'),
    },
  })
  if (response.status !== 0) throw new Error(`Fixture Git failed: ${response.stderr}`)
  return response.stdout.trim()
}
function commit(root: string, subject = 'feat: implement fixture behavior') {
  command(root, 'add', '.')
  command(
    root,
    '-c',
    'user.name=Fixture Owner',
    '-c',
    'user.email=fixture@example.com',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-m',
    subject,
    '-m',
    'Create deterministic fixture history for workspace lifecycle verification.',
  )
}
function snapshot(root: string) {
  const files: Record<string, string> = {}
  function walk(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const file = join(path, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile())
        files[file.slice(root.length)] = readFileSync(file).toString('base64')
    }
  }
  walk(root)
  return {
    branch: command(root, 'branch', '--show-current'),
    head: command(root, 'rev-parse', 'HEAD'),
    index: createHash('sha256')
      .update(readFileSync(join(root, '.git/index')))
      .digest('hex'),
    status: command(root, 'status', '--porcelain=v1', '-z'),
    files,
  }
}
function fixture(
  run: (dir: string, engine: FlowEngine, manager: WorktreeManager) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-worktrees-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  command(root, 'init', '-b', 'main')
  writeFileSync(join(root, 'README.md'), '# Fixture repository\n')
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { check: 'node --version' } }),
  )
  commit(root, 'chore: seed fixture repository')
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state/wholeloop')),
    root,
    join(dir, 'config/wholeloop/config.yml'),
    join(dir, 'home'),
  )
  return Promise.resolve()
    .then(() => run(dir, engine, new WorktreeManager(engine)))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}
const slice = (engine: FlowEngine, title = 'Find a past order') =>
  engine.store.create({
    kind: 'slice',
    title,
    owner: 'Alex',
    body: 'Return one owned order by its number.',
    repository: engine.root,
  }).id

describe('isolated Git worktree provisioning', () => {
  it('builds two independent branches while preserving the person branch, index and dirty files exactly', () =>
    fixture((_dir, engine, manager) => {
      writeFileSync(join(engine.root, 'README.md'), '# Person staged work\n')
      command(engine.root, 'add', 'README.md')
      writeFileSync(join(engine.root, 'personal.txt'), 'Untracked personal work\n')
      const before = snapshot(engine.root)
      const a = manager.create(slice(engine), { base: 'main' }).record
      const b = manager.create(slice(engine, 'Show the empty order state'), { base: 'main' }).record
      expect(a.path).not.toBe(b.path)
      expect(a.ports.end).toBeLessThan(b.ports.start)
      expect(a.base.ref).toBe('refs/heads/main')
      expect(a.base.sha).toBe(before.head)
      writeFileSync(join(a.path, 'README.md'), '# First builder output\n')
      commit(a.path)
      writeFileSync(join(b.path, 'other.md'), '# Second builder output\n')
      expect(readFileSync(join(b.path, 'README.md'), 'utf8')).toBe('# Fixture repository\n')
      expect(existsSync(join(a.path, 'other.md'))).toBe(false)
      expect(snapshot(engine.root)).toEqual(before)
      const projected = engine.store.files.read(`items/${a.subject}/worktree.json`)
      expect(projected).toContain(a.branch)
      engine.store.rebuild()
      expect(engine.store.files.read(`items/${a.subject}/worktree.json`)).toBe(projected)
      expect(
        manager
          .list()
          .map((record) => record.branch)
          .sort(),
      ).toEqual([a.branch, b.branch].sort())
    }))

  it('reuses an active allocation and pins a stacked branch to its predecessor commit', () =>
    fixture((_dir, engine, manager) => {
      const id = slice(engine)
      const a = manager.create(id, { base: 'main' })
      const before = engine.store.events()
      expect(manager.create(id)).toMatchObject({ created: false, record: { path: a.record.path } })
      expect(engine.store.events()).toEqual(before)
      writeFileSync(join(a.record.path, 'contract.md'), '# Agreed interface\n')
      commit(a.record.path)
      const b = manager.create(slice(engine, 'Use the agreed contract'), { after: id }).record
      expect(b.base).toEqual({
        ref: `refs/heads/${a.record.branch}`,
        sha: command(a.record.path, 'rev-parse', 'HEAD'),
      })
      expect(b.target.ref).toBe('refs/heads/main')
      expect(readFileSync(join(b.path, 'contract.md'), 'utf8')).toContain('Agreed interface')
      expect(() => manager.create(id, { base: b.branch })).toThrow('different base')
    }))

  it('does not run checkout hooks while provisioning and does not mark open as human testing', () =>
    fixture((_dir, engine, manager) => {
      const marker = join(engine.root, 'hook-ran.txt')
      const hook = join(engine.root, '.git/hooks/post-checkout')
      writeFileSync(
        hook,
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'Unexpected hook output');\n`,
      )
      chmodSync(hook, 0o755)
      const id = slice(engine)
      manager.create(id, { base: 'main' })
      expect(existsSync(marker)).toBe(false)
      const opened = manager.open(id)
      expect(opened.tested).toBe(false)
      expect(opened.commands.some((entry) => entry.argv.includes('check'))).toBe(true)
      expect(opened.environment.PORT).toBe('5200')
      expect(engine.store.events().some((entry) => entry.type === 'decision.recorded')).toBe(false)
    }))

  it('recovers an interrupted ready receipt from the recorded intent without duplicating the checkout', () =>
    fixture((_dir, engine, manager) => {
      const id = slice(engine)
      const original = manager.create(id, { base: 'main' }).record
      const month = `journal/${new Date().toISOString().slice(0, 7)}.ndjson`
      const entries = (engine.store.files.read(month) ?? '').trimEnd().split('\n')
      expect(JSON.parse(entries.at(-1) ?? '{}').type).toBe('worktree.ready')
      engine.store.files.atomic(month, `${entries.slice(0, -1).join('\n')}\n`)
      expect(manager.list()[0]?.status).toBe('creating')
      const resumed = manager.create(id)
      expect(resumed.record).toMatchObject({
        path: original.path,
        branch: original.branch,
        base: original.base,
        ports: original.ports,
        status: 'active',
      })
      expect(
        command(engine.root, 'worktree', 'list', '--porcelain').match(/worktree /g),
      ).toHaveLength(2)
    }))

  it('rejects missing bases, raw commit IDs and symlink escapes before recording an allocation', () =>
    fixture((dir, engine, manager) => {
      const id = slice(engine)
      const before = engine.store.events()
      expect(() => manager.create(id)).toThrow('Provide --base')
      expect(() => manager.create(id, { base: command(engine.root, 'rev-parse', 'HEAD') })).toThrow(
        'named',
      )
      const key = repository(engine.root).key
      const target = join(engine.store.files.root, 'worktrees', key)
      mkdirSync(dirname(target), { recursive: true })
      const outside = join(dir, 'outside')
      mkdirSync(outside)
      symlinkSync(outside, target)
      expect(() => manager.create(id, { base: 'main' })).toThrow('escapes')
      expect(engine.store.events()).toEqual(before)
      expect(readdirSync(outside)).toEqual([])
    }))

  it('serializes real concurrent CLI allocations and reserves disjoint port ranges', () =>
    fixture(async (dir, engine) => {
      const before = snapshot(engine.root)
      const ids = [slice(engine), slice(engine, 'Empty state')]
      const execute = (id: string) =>
        new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
          const child = spawn(
            process.execPath,
            [resolve('dist/wl.mjs'), 'worktree', 'create', id, '--base', 'main', '--json'],
            {
              cwd: engine.root,
              env: {
                ...process.env,
                XDG_CONFIG_HOME: join(dir, 'config'),
                XDG_STATE_HOME: join(dir, 'state'),
                WL_WORKSPACE: '',
              },
            },
          )
          let output = ''
          child.stdout.on('data', (chunk) => {
            output += String(chunk)
          })
          child.on('error', reject)
          child.on('close', (code) => resolveResult({ code, output }))
        })
      const responses = await Promise.all(ids.map(execute))
      expect(responses.map((response) => response.code)).toEqual([0, 0])
      const records = responses
        .map((response) => JSON.parse(response.output).record)
        .sort((a, b) => a.ports.start - b.ports.start)
      expect(records[0].ports.end).toBeLessThan(records[1].ports.start)
      expect(snapshot(engine.root)).toEqual(before)
    }))
})

describe('safe workspace cleanup', () => {
  it('retains a changed worktree identity while cleaning other eligible records', () =>
    fixture((_dir, engine, manager) => {
      const a = manager.create(slice(engine), { base: 'main' }).record
      const b = manager.create(slice(engine, 'Independent fixture work'), { base: 'main' }).record
      manager.stop(a.subject)
      manager.stop(b.subject)
      command(a.path, 'switch', '-c', 'human-inspection')
      const report = manager.prune()
      expect(report.actions.find((action) => action.subject === a.subject)).toMatchObject({
        action: 'retained',
        reason: expect.stringContaining('ownership'),
      })
      expect(report.actions.find((action) => action.subject === b.subject)?.action).toBe('pruned')
      expect(existsSync(a.path)).toBe(true)
      expect(existsSync(b.path)).toBe(false)
    }))

  it('rejects port-pool exhaustion without reusing retained allocations', () =>
    fixture((_dir, engine, manager) => {
      const record = manager.create(slice(engine), { base: 'main' }).record
      const full = Array.from({ length: 100 }, (_, index) => ({
        ...record,
        ports: { start: 5200 + index * 10, end: 5209 + index * 10 },
      }))
      expect(() => allocatePorts(full)).toThrow('exhausted')
      const first = full[0]
      if (first) first.status = 'pruned'
      expect(allocatePorts(full)).toEqual({ start: 5200, end: 5209 })
    }))

  it('prunes only recorded stopped clean merged work and preserves unrelated worktrees and branches', () =>
    fixture((dir, engine, manager) => {
      const human = join(dir, 'human-worktree')
      command(engine.root, 'worktree', 'add', '-b', 'human-work', human, 'main')
      const before = snapshot(engine.root)
      const id = slice(engine)
      const record = manager.create(id, { base: 'main' }).record
      expect(manager.prune(id).actions[0]?.reason).toContain('Stop active')
      manager.stop(id)
      const events = engine.store.events()
      expect(manager.prune(id, true)).toMatchObject({
        dryRun: true,
        actions: [{ action: 'would-prune', reason: 'merged' }],
      })
      expect(engine.store.events()).toEqual(events)
      expect(existsSync(record.path)).toBe(true)
      expect(manager.prune(id).actions[0]?.action).toBe('pruned')
      expect(existsSync(record.path)).toBe(false)
      expect(existsSync(human)).toBe(true)
      expect(command(engine.root, 'show-ref', '--verify', `refs/heads/${record.branch}`)).toContain(
        record.base.sha,
      )
      expect(manager.prune(id).actions[0]?.reason).toContain('Already pruned')
      expect(snapshot(engine.root)).toEqual(before)
    }))

  it('retains unmerged or dirty output and requires explicit abandonment before removing rejected work', () =>
    fixture((_dir, engine, manager) => {
      const id = slice(engine)
      const record = manager.create(id, { base: 'main' }).record
      writeFileSync(join(record.path, 'feature.md'), '# Unmerged feature\n')
      commit(record.path)
      const tip = command(record.path, 'rev-parse', 'HEAD')
      manager.stop(id)
      expect(manager.prune(id).actions[0]?.reason).toContain('not merged')
      expect(() => manager.stop(id, ' ')).toThrow('explicit reason')
      manager.stop(id, 'Prototype rejected by the owner')
      writeFileSync(join(record.path, 'keep.txt'), 'Uncommitted evidence\n')
      expect(manager.prune(id).actions[0]?.reason).toContain('contains changes')
      expect(readFileSync(join(record.path, 'keep.txt'), 'utf8')).toContain('Uncommitted')
      rmSync(join(record.path, 'keep.txt'))
      expect(manager.prune(id).actions[0]).toMatchObject({
        action: 'pruned',
        reason: 'abandoned',
        branchRetained: true,
      })
      expect(command(engine.root, 'rev-parse', record.branch)).toBe(tip)
      expect(() => manager.create(id)).toThrow('cannot resume implicitly')
    }))

  it('honors Git worktree locks and releases port reservations only after successful prune', () =>
    fixture((_dir, engine, manager) => {
      const id = slice(engine)
      const record = manager.create(id, { base: 'main' }).record
      command(engine.root, 'worktree', 'lock', '--reason', 'Owner inspection', record.path)
      manager.stop(id)
      expect(manager.prune(id).actions[0]?.reason).toContain('locked')
      expect(allocatePorts(manager.list()).start).toBe(5210)
      command(engine.root, 'worktree', 'unlock', record.path)
      manager.prune(id)
      expect(allocatePorts(manager.list()).start).toBe(5200)
    }))
})

describe('explicit checkout opt-out', () => {
  it('requires clean single-lease work, retains output on stop and restores the original branch on eligible prune', () =>
    fixture((_dir, engine, manager) => {
      mkdirSync(join(engine.root, '.wholeloop'))
      writeFileSync(
        join(engine.root, '.wholeloop/config.yml'),
        'version: 1\nbuild: {workspace: checkout}\n',
      )
      commit(engine.root, 'chore: select checkout workspace')
      const id = slice(engine)
      const original = readFileSync(join(engine.root, 'README.md'), 'utf8')
      writeFileSync(join(engine.root, 'README.md'), 'Dirty user work\n')
      expect(() => manager.create(id, { base: 'main' })).toThrow('must be clean')
      expect(command(engine.root, 'branch', '--show-current')).toBe('main')
      writeFileSync(join(engine.root, 'README.md'), original)
      const record = manager.create(id, { base: 'main' }).record
      expect(record).toMatchObject({ mode: 'checkout', path: repository(engine.root).path })
      expect(command(engine.root, 'branch', '--show-current')).toBe(record.branch)
      expect(() => manager.create(slice(engine, 'Another build'), { base: 'main' })).toThrow(
        'already leased',
      )
      manager.stop(id)
      expect(command(engine.root, 'branch', '--show-current')).toBe(record.branch)
      expect(manager.prune(id).actions[0]).toMatchObject({
        action: 'pruned',
        checkoutRetained: true,
      })
      expect(existsSync(engine.root)).toBe(true)
      expect(command(engine.root, 'branch', '--show-current')).toBe('main')
      expect(readFileSync(join(engine.root, 'README.md'), 'utf8')).toBe(original)
    }))
})

describe('compiled workspace lifecycle', () => {
  it('runs create/open/list/stop/prune with explicit abandonment and idempotent stop', () =>
    fixture((dir, engine) => {
      const cli = (...args: string[]) => {
        const response = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'worktree', ...args, '--json'],
          {
            cwd: engine.root,
            env: {
              ...process.env,
              XDG_CONFIG_HOME: join(dir, 'config'),
              XDG_STATE_HOME: join(dir, 'state'),
              WL_WORKSPACE: '',
            },
            encoding: 'utf8',
          },
        )
        return { code: response.status, value: JSON.parse(response.stdout) }
      }
      const id = slice(engine)
      expect(cli('create', id, '--base', 'main').code).toBe(0)
      expect(cli('open', id)).toMatchObject({ code: 0, value: { tested: false } })
      const status = spawnSync(process.execPath, [resolve('dist/wl.mjs'), 'status', id, '--json'], {
        cwd: engine.root,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: join(dir, 'config'),
          XDG_STATE_HOME: join(dir, 'state'),
          WL_WORKSPACE: '',
        },
        encoding: 'utf8',
      })
      expect(status.status).toBe(0)
      expect(JSON.parse(status.stdout).items[0].workspace.branch).toBe(`wl/${id}`)
      expect(cli('list').value.worktrees).toHaveLength(1)
      expect(cli('stop', id, '--abandon').code).toBe(2)
      expect(
        cli('stop', id, '--abandon', '--reason', 'Owner rejected the fixture prototype'),
      ).toMatchObject({ code: 0, value: { record: { status: 'stopped' } } })
      const before = engine.store.events()
      expect(cli('stop', id).code).toBe(0)
      expect(engine.store.events()).toEqual(before)
      expect(cli('prune', id, '--dry-run').value.actions[0].action).toBe('would-prune')
      expect(engine.store.events()).toEqual(before)
      expect(cli('prune', id).value.actions[0]).toMatchObject({
        action: 'pruned',
        reason: 'abandoned',
      })
    }))
})
