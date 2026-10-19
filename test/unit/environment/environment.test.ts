import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { environmentDeclarations } from '../../../src/environment/contracts.js'
import { EnvironmentLedger } from '../../../src/environment/ledger.js'
import { canonicalPath } from '../../../src/state/paths.js'
import { contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(
  run: (context: {
    dir: string
    root: string
    store: StateStore
    subject: string
    ledger: EnvironmentLedger
  }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-environment-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const store = new StateStore(join(dir, 'state/wholeloop'))
  const subject = store.create({
    kind: 'slice',
    title: 'Fixture',
    owner: 'Owner',
    body: '',
    repository: root,
  }).id
  try {
    run({ dir, root, store, subject, ledger: new EnvironmentLedger(store) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const write = (root: string) => ({
  key: 'seed-orders',
  resource: 'fixture://db/orders',
  effect: 'Seeded local test orders',
  undo: { cwd: root, argv: ['fixture-db', 'remove-seed', '--name', 'orders with spaces'] },
  by: 'Owner',
})

describe('external environment declarations', () => {
  it('records exact undo argv without executing it and treats reordered identical inputs idempotently', () =>
    fixture(({ dir, root, subject, ledger, store }) => {
      const marker = join(dir, 'must-not-exist')
      const input = {
        ...write(root),
        undo: {
          cwd: root,
          argv: [
            process.execPath,
            '-e',
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`,
            '',
          ],
        },
      }
      expect(ledger.declare(subject, input).declared).toBe(true)
      expect(existsSync(marker)).toBe(false)
      const count = store.events().length
      expect(
        ledger.declare(subject, {
          by: input.by,
          effect: input.effect,
          undo: input.undo,
          resource: input.resource,
          key: input.key,
        }).declared,
      ).toBe(false)
      expect(store.events()).toHaveLength(count)
      expect(ledger.report(subject).entries[0]?.write.undo.argv).toEqual(input.undo.argv)
      expect(ledger.report(subject).executed).toBe(false)
      expect(ledger.report(subject).receipt).toContain('not observed undo results')
    }))

  it('refuses to overwrite an existing recipe and rolls back duplicate raw journal events', () =>
    fixture(({ root, subject, ledger, store }) => {
      ledger.declare(subject, write(root))
      const before = store.events()
      expect(() =>
        ledger.declare(subject, { ...write(root), effect: 'Different operation' }),
      ).toThrow('immutable write')
      expect(() =>
        store.transaction((_events, append) =>
          append(subject, { type: 'env.declared', data: write(root) }),
        ),
      ).toThrow('immutable within')
      expect(store.events()).toEqual(before)
    }))

  it('includes descendant and shared ancestor writes without copying unrelated sibling effects', () =>
    fixture(({ root, store, subject, ledger }) => {
      const first = store.create({
        kind: 'part',
        title: 'API',
        owner: 'Owner',
        body: '',
        parent: subject,
        repository: root,
      }).id
      const second = store.create({
        kind: 'part',
        title: 'Web',
        owner: 'Owner',
        body: '',
        parent: subject,
        repository: root,
      }).id
      ledger.declare(subject, write(root))
      ledger.declare(first, { ...write(root), key: 'api-server', effect: 'Started API server' })
      ledger.declare(second, { ...write(root), key: 'web-server', effect: 'Started web server' })
      expect(ledger.report(subject).entries).toHaveLength(3)
      expect(ledger.report(first).entries.map((entry) => entry.write.key)).toEqual([
        'seed-orders',
        'api-server',
      ])
      expect(ledger.report(first).receipt).not.toContain('web-server')
      expect(ledger.report(subject).receipt.indexOf('web-server')).toBeLessThan(
        ledger.report(subject).receipt.indexOf('seed-orders'),
      )
    }))

  it('rebuilds the full receipt and keeps bounded resume context as a reference', () =>
    fixture(({ root, store, subject, ledger }) => {
      ledger.declare(subject, write(root))
      const path = `items/${subject}/environment.md`
      const before = store.files.read(path)
      expect(before).toContain('orders with spaces')
      store.files.atomic(path, 'corrupted projection')
      store.rebuild()
      expect(store.files.read(path)).toBe(before)
      expect(JSON.stringify(contextPack(store.events(), subject))).toContain(path)
      expect(environmentDeclarations(store.events())).toHaveLength(1)
    }))

  it.each([
    { argv: ['fixture-tool', '--password'] },
    { argv: ['fixture-tool', '--token=not-a-secret-placeholder'] },
    { argv: [] },
  ])('refuses credential-bearing or missing argv %j without echoing its contents', ({ argv }) =>
    fixture(({ root, subject, ledger, store }) => {
      const before = store.events().length
      expect(() => ledger.declare(subject, { ...write(root), undo: { cwd: root, argv } })).toThrow(
        'non-secret fields',
      )
      expect(store.events()).toHaveLength(before)
    }),
  )

  it('allows a credential-aware tool flag, rejects unknown/closed items and represents missing declarations honestly', () =>
    fixture(({ root, subject, ledger, store }) => {
      expect(ledger.report(subject).receipt).toContain('does not prove')
      expect(() => ledger.declare('slice-00000000', write(root))).toThrow('existing open item')
      ledger.declare(subject, {
        ...write(root),
        undo: { cwd: root, argv: ['credential-aware-wrapper', '--password-stdin'] },
      })
      store.update(subject, { status: 'closed' })
      expect(() => ledger.declare(subject, { ...write(root), key: 'new-write' })).toThrow(
        'existing open item',
      )
      expect(ledger.report(subject).entries).toHaveLength(1)
    }))

  it('runs compiled declare/report with relative cwd resolution and no undo execution', () =>
    fixture(({ dir, root }) => {
      const state = join(dir, 'cli-state')
      const env = {
        ...process.env,
        HOME: join(dir, 'home'),
        XDG_STATE_HOME: state,
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
      }
      const isolated = new StateStore(join(state, 'wholeloop'))
      const item = isolated.create({
        kind: 'slice',
        title: 'CLI fixture',
        owner: 'Owner',
        body: '',
        repository: root,
      })
      const file = join(dir, 'environment.json')
      writeFileSync(
        file,
        JSON.stringify({ ...write(root), undo: { cwd: '.', argv: ['fixture-db', 'undo'] } }),
      )
      const call = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          env,
        })
        if (result.status !== 0) throw new Error(result.stdout + result.stderr)
        return JSON.parse(result.stdout)
      }
      expect(call('env', 'declare', '--for', item.id, '--file', file).write.undo.cwd).toBe(
        canonicalPath(root),
      )
      expect(call('env', 'report', '--for', item.id).receipt).toContain('["fixture-db","undo"]')
      expect(call('env', 'declare', '--for', item.id, '--file', file).declared).toBe(false)
    }))
})
