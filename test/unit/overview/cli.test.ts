import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { StateStore } from '../../../src/state/store.js'

const executable = resolve('dist/wl.mjs')
function invoke(root: string, args: string[]) {
  const value = spawnSync(process.execPath, [executable, ...args, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_STATE_HOME: join(root, 'state'),
      XDG_CONFIG_HOME: join(root, 'config'),
      WL_WORKSPACE: '',
    },
  })
  return {
    code: value.status,
    errors: value.stderr,
    value: JSON.parse(value.stdout) as Record<string, unknown>,
  }
}
function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-overview-cli-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
describe('compiled overview inspection', () => {
  it('binds an approval to the displayed basis and refuses a later revision without mutation', () =>
    fixture((root) => {
      const store = new StateStore(join(root, 'state/wholeloop')),
        engine = new FlowEngine(store, root, join(root, 'user.yml'), root),
        item = store.create({
          kind: 'initiative',
          title: 'A specification',
          owner: 'Owner',
          body: '',
        })
      engine.skip('write-spec', item.id, 'Adopt a specification')
      const old = engine.plan(item.id).pending[0]?.basis
      if (!old) throw new Error('Displayed approval basis required')
      engine.skip('write-spec', item.id, 'Adopt a revised specification')
      const current = engine.plan(item.id).pending[0]?.basis
      if (!current) throw new Error('Revised approval basis required')
      const before = store.events(),
        args = [
          'answer',
          'decision.approve-spec=approved',
          '--for',
          item.id,
          '--by',
          'Owner',
          '--basis',
        ],
        refused = invoke(root, [...args, old])
      expect(refused.code).toBe(3)
      expect(refused.value.message).toContain('displayed decision basis changed')
      expect(store.events()).toEqual(before)
      expect(invoke(root, [...args, current]).code).toBe(0)
      expect(store.events().at(-1)).toMatchObject({
        type: 'decision.recorded',
        data: { basis: current },
      })
      expect(invoke(root, ['answer', 'owner=Owner', '--basis', current]).code).not.toBe(0)
      expect(existsSync(join(root, 'config/wholeloop/config.yml'))).toBe(false)
    }))
  it('prints both contract identities without creating or opening a store', () =>
    fixture((root) => {
      const store = join(root, 'state/wholeloop'),
        value = invoke(root, ['overview', 'schema'])
      expect(value.code).toBe(0)
      expect(value.errors).toBe('')
      expect(value.value).toMatchObject({
        schema: 'wholeloop/overview-schema@1',
        available: { overview: true, watch: false },
        contracts: {
          overview: { $id: 'wholeloop/overview@1' },
          watch: { $id: 'wholeloop/watch-frame@1' },
        },
      })
      expect(existsSync(store)).toBe(false)
    }))
  it('reads the configured store without exposing source content or changing the journal', () =>
    fixture((root) => {
      const store = new StateStore(join(root, 'state/wholeloop')),
        item = store.create({
          kind: 'initiative',
          title: 'PRIVATE_OVERVIEW_TITLE',
          owner: 'PRIVATE_OWNER',
          body: 'PRIVATE_OVERVIEW_BODY',
        }),
        before = store.events(),
        files = readdirSync(store.files.path('journal')),
        bytes = files.map((name) => readFileSync(store.files.path(`journal/${name}`), 'utf8')),
        result = invoke(root, ['overview'])
      expect(result.code).toBe(0)
      expect(result.errors).toBe('')
      expect(result.value).toMatchObject({
        schema: 'wholeloop/overview@1',
        headline: 'ready',
        items: [expect.objectContaining({ id: item.id })],
      })
      expect(JSON.stringify(result.value)).not.toContain('PRIVATE_')
      expect(store.events()).toEqual(before)
      expect(
        files.map((name) => readFileSync(store.files.path(`journal/${name}`), 'utf8')),
      ).toEqual(bytes)
      expect(existsSync(store.files.path('.lock'))).toBe(false)
    }))
  it('represents a held writer as unavailable data without acquiring another lock', () =>
    fixture((root) => {
      const directory = join(root, 'state/wholeloop/.lock')
      mkdirSync(directory, { recursive: true })
      const result = invoke(root, ['overview'])
      expect(result.code).toBe(3)
      expect(result.value).toMatchObject({
        schema: 'wholeloop/overview@1',
        headline: 'unavailable',
        health: { status: 'busy', problems: ['store-busy'] },
        cursor: null,
        counts: null,
      })
      expect(readdirSync(directory)).toEqual([])
    }))
})
