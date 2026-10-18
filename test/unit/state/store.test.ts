import { execFile, execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { event, replay, validateEvent } from '../../../src/state/events.js'
import { StoreFiles } from '../../../src/state/files.js'
import { canonicalPath, storePath } from '../../../src/state/paths.js'
import { projections } from '../../../src/state/projections.js'
import { StateStore } from '../../../src/state/store.js'

const input = {
  kind: 'initiative',
  title: 'Improve search',
  owner: 'Test Owner',
  body: '# Problem\n\nFind orders faster.',
} as const

function temporary(operation: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-store-'))
  try {
    operation(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('external state', () => {
  it('honors XDG and isolates named workspaces', () => {
    expect(storePath({}, '/home/test')).toBe('/home/test/.local/state/wholeloop')
    expect(storePath({ XDG_STATE_HOME: '/state', WL_WORKSPACE: 'work' }, '/home/test')).toBe(
      '/state/wholeloop/workspaces/work',
    )
    expect(storePath({ XDG_STATE_HOME: 'relative' }, '/home/test')).toBe(
      '/home/test/.local/state/wholeloop',
    )
    expect(() => storePath({ WL_WORKSPACE: '../escape' })).toThrow('WL_WORKSPACE')
  })

  it('rebuilds byte-identical projections after they are removed or corrupted', () =>
    temporary((dir) => {
      const store = new StateStore(dir)
      const initiative = store.create(input)
      const child = store.create({ ...input, kind: 'scope', parent: initiative.id })
      store.update(child.id, { status: 'closed', title: 'New title' })
      store.note(initiative.id, 'Evidence from support')
      store.link(initiative.id, 'https://example.com/spec')
      const before = projections(replay(store.events()))
      const journal = store.events()
      rmSync(join(dir, 'items'), { recursive: true })
      writeFileSync(join(dir, 'links.json'), 'broken')
      expect(store.get(child.id).status).toBe('closed')
      expect(store.rebuild()).toBe(before.size)
      for (const [path, content] of before)
        expect(readFileSync(join(dir, path), 'utf8')).toBe(content)
      expect(store.events()).toEqual(journal)
      const restarted = new StateStore(dir)
      expect(restarted.get(initiative.id).notes).toHaveLength(1)
      expect(restarted.get(initiative.id).links).toEqual(['https://example.com/spec'])
    }))

  it('refuses repositories, worktrees and symlinked destinations before writing', () =>
    temporary((dir) => {
      const repo = join(dir, 'repo')
      mkdirSync(repo)
      execFileSync('git', ['init', '-q', repo])
      expect(() => new StateStore(join(repo, 'nested/store'))).toThrow('outside git')
      const alias = join(dir, 'alias')
      symlinkSync(repo, alias)
      expect(() => new StateStore(join(alias, 'store'))).toThrow('outside git')
      const store = new StateStore(join(dir, 'store'))
      mkdirSync(store.files.root)
      symlinkSync(repo, join(store.files.root, 'items'))
      expect(() => store.create(input)).toThrow('escapes its root')
      expect(readdirSync(repo)).toEqual(['.git'])
      const worktree = join(dir, 'worktree')
      mkdirSync(worktree)
      writeFileSync(join(worktree, '.git'), 'gitdir: /unused')
      expect(() => new StateStore(join(worktree, 'state'))).toThrow('outside git')
    }))

  it('rejects path traversal, invalid events, missing parents and unsafe links', () =>
    temporary((dir) => {
      const store = new StateStore(dir)
      expect(() => store.files.atomic('../escape', 'bad')).toThrow('escapes')
      expect(() => store.create({ ...input, parent: 'scope-12345678' })).toThrow('Missing parent')
      expect(store.events()).toEqual([])
      const item = store.create(input)
      const before = store.events()
      expect(() => store.link(item.id, 'javascript:alert(1)')).toThrow('Invalid')
      expect(() => store.update(item.id, {})).toThrow('Invalid')
      expect(() => validateEvent({ v: 2 })).toThrow('Invalid')
      expect(store.events()).toEqual(before)
    }))

  it('refuses a torn journal without truncating evidence', () =>
    temporary((dir) => {
      const store = new StateStore(dir)
      store.create(input)
      const name = readdirSync(join(dir, 'journal'))[0] ?? ''
      const file = join(dir, 'journal', name)
      const broken = `${readFileSync(file, 'utf8')}{"v":`
      writeFileSync(file, broken)
      expect(() => store.create(input)).toThrow('Incomplete journal')
      expect(readFileSync(file, 'utf8')).toBe(broken)
    }))

  it('times out rather than stealing a lock from an active writer', () =>
    temporary((dir) => {
      const files = new StoreFiles(dir)
      files.locked(() => {
        expect(() => files.locked(() => {}, 15)).toThrow('Store is locked')
      })
      expect(readdirSync(dir)).not.toContain('.lock')
    }))

  it('does not let replay mutate the input journal', () => {
    const entry = event(
      'init-12345678',
      { type: 'item.created', data: input },
      '2026-10-18T00:00:00.000Z',
    )
    const before = JSON.stringify(entry)
    replay([entry])
    expect(JSON.stringify(entry)).toBe(before)
  })

  it('rolls back a failed batch before touching the journal', () =>
    temporary((dir) => {
      const store = new StateStore(dir)
      const item = store.create(input)
      const before = store.events()
      expect(() =>
        store.transaction((_events, append) => {
          append(item.id, { type: 'note.added', data: { text: 'Must roll back' } })
          throw new Error('Abort the operation')
        }),
      ).toThrow('Abort')
      expect(store.events()).toEqual(before)
    }))

  it('serializes concurrent processes without lost events or corrupt projections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-concurrent-'))
    try {
      const env = { ...process.env, XDG_STATE_HOME: dir, WL_WORKSPACE: 'stress' }
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          promisify(execFile)(
            process.execPath,
            [
              resolve('dist/wl.mjs'),
              'state',
              'create',
              'initiative',
              '--title',
              `Item ${index}`,
              '--owner',
              'Test Owner',
              '--json',
            ],
            { env },
          ),
        ),
      )
      const store = new StateStore(storePath(env))
      expect(store.events()).toHaveLength(12)
      expect(new Set(store.list().map((item) => item.id)).size).toBe(12)
      const before = projections(replay(store.events()))
      for (const [path, content] of before) expect(store.files.read(path)).toBe(content)
      expect(canonicalPath(store.files.root)).toBe(store.files.root)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
