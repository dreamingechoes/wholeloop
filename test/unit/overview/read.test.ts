import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { itemFlow } from '../../../src/flow/plan.js'
import { projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import { deliveryReport } from '../../../src/runner/operator-report.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { StateStore } from '../../../src/state/store.js'
import { authorization, fixture } from '../../support/delivery.js'

const at = '2026-11-04T20:00:00.000Z'
function tree(root: string): unknown {
  if (!existsSync(root)) return null
  return readdirSync(root)
    .sort()
    .map((name) => {
      const file = join(root, name),
        stat = lstatSync(file)
      return [
        name,
        stat.mode,
        stat.isDirectory() ? tree(file) : contractDigest(readFileSync(file).toString('base64')),
      ]
    })
}
async function temporary(run: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-overview-read-'))
  try {
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('stable read-only overview inputs', () => {
  it('reads an absent store without creating it or acquiring a lock', async () => {
    await temporary((root) => {
      const store = join(root, 'missing'),
        result = readOverview({ root, store, at, userFile: join(root, 'user.yml') })
      expect(result.items.size).toBe(0)
      expect(result.states.size).toBe(0)
      expect(result.position.state.count).toBe(0)
      expect(result.position.delivery.sequence).toBe(0)
      expect(existsSync(store)).toBe(false)
    })
  })
  it('shares current and inherited flow rules with execution and keeps projection rebuilds out of the cursor', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'store')),
        userFile = join(root, 'user.yml'),
        engine = new FlowEngine(store, root, userFile, root),
        parent = store.create({
          kind: 'initiative',
          title: 'PRIVATE_TITLE',
          owner: 'Owner',
          body: 'PRIVATE_BODY',
        }),
        child = store.create({
          kind: 'scope',
          title: 'A scope',
          owner: 'Owner',
          body: '',
          parent: parent.id,
        })
      engine.skip('write-spec', parent.id, 'Adopt an existing specification')
      const before = tree(store.files.root),
        first = readOverview({ root, store: store.files.root, at, userFile })
      for (const item of first.items.values())
        expect(itemFlow(first.stateEvents, item.id, first.configuration.additions)).toEqual(
          engine.plan(item.id),
        )
      expect(itemFlow(first.stateEvents, child.id).pending).toContainEqual(
        expect.objectContaining({ id: 'approve-spec', subject: parent.id }),
      )
      expect(tree(store.files.root)).toEqual(before)
      store.rebuild()
      const rebuilt = readOverview({ root, store: store.files.root, at, userFile })
      expect(rebuilt.cursor).toBe(first.cursor)
      expect(rebuilt.configurationDigest).toBe(first.configurationDigest)
    })
  })
  it('agrees with original delivery and runner reads at the same observation time without mutations', async () => {
    await fixture(({ planning, plan, root, dir }) => {
      const runner = new RunnerStore(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = runner.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      runner.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const request: RunnerRequest = {
          schema: 'wholeloop/delivery-runner-request@1',
          key: 'overview',
          run: plan.run,
          revision: 1,
          plan: prepared.digest,
          grant: grant.grant.id,
          host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
          pollMs: 50,
        },
        digest = runner.prepare(request).digest,
        before = tree(runner.files.root),
        value = readOverview({
          root,
          store: runner.files.root,
          at,
          userFile: join(dir, 'user.yml'),
        })
      expect(value.reports.get(plan.run)).toEqual(
        deliveryReport(runner.files.root, plan.run, () => at),
      )
      expect(value.runners.get(digest)).toEqual(runner.inspect(digest))
      expect(tree(runner.files.root)).toEqual(before)
      runner.lifecycle.journal.rebuild()
      new StateStore(runner.files.root).rebuild()
      const rebuilt = readOverview({
        root,
        store: runner.files.root,
        at,
        userFile: join(dir, 'user.yml'),
      })
      expect(rebuilt.cursor).toBe(value.cursor)
      expect(projectOverview(rebuilt).digest).toBe(projectOverview(value).digest)
      runner.control(digest, 'pause', 'Owner')
      const paused = readOverview({
        root,
        store: runner.files.root,
        at,
        userFile: join(dir, 'user.yml'),
      })
      expect(paused.reports.get(plan.run)?.state).toBe('paused')
      expect(paused.cursor).not.toBe(value.cursor)
    })
  })
  it('reports a held writer as busy without creating a competing lock or modifying ownership', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'store'))
      store.files.locked(() => {
        const before = tree(store.files.root)
        expect(() =>
          readOverview({ root, store: store.files.root, at, userFile: join(root, 'user.yml') }),
        ).toThrow('store-busy')
        expect(tree(store.files.root)).toEqual(before)
      })
    })
  })
  it.each(['invalid-line', 'unknown-segment', 'aliased-segment', 'private-config-error'])(
    'refuses %s without leaking contents or repairing input',
    async (kind) => {
      await temporary((root) => {
        const store = new StateStore(join(root, 'store')),
          userFile = join(root, 'PRIVATE_CONFIG_PATH.yml')
        mkdirSync(store.files.path('journal'), { recursive: true })
        const file = store.files.path('journal/2026-11.ndjson')
        if (kind === 'invalid-line') writeFileSync(file, 'PRIVATE_BAD_JOURNAL\n')
        if (kind === 'unknown-segment')
          writeFileSync(store.files.path('journal/unknown.ndjson'), 'PRIVATE_UNKNOWN_SEGMENT\n')
        if (kind === 'aliased-segment') {
          writeFileSync(join(root, 'outside'), 'PRIVATE_ALIAS\n')
          symlinkSync(join(root, 'outside'), file)
        }
        if (kind === 'private-config-error')
          writeFileSync(userFile, 'version: PRIVATE_CONFIG_VALUE\n')
        const before = tree(root)
        let message = ''
        try {
          readOverview({ root, store: store.files.root, at, userFile })
        } catch (error) {
          message = String(error)
        }
        expect(message).toContain('store-unreadable')
        expect(message).not.toContain('PRIVATE_')
        expect(tree(root)).toEqual(before)
        expect(existsSync(store.files.path('.lock'))).toBe(false)
      })
    },
  )
})
