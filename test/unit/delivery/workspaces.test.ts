import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type DeliveryWorkspaceRequest,
  DeliveryWorkspaces,
} from '../../../src/delivery/workspaces.js'
import { ENVIRONMENT_SNAPSHOT_LIMITS } from '../../../src/environment/candidates.js'
import { authorization, git } from '../../support/delivery.js'
import { deliveryWorkspaceFixture as setup } from '../../support/delivery-workspaces.js'
import { integrationFixture } from '../../support/integration.js'

afterEach(() => vi.restoreAllMocks())

describe('owned delivery workspaces', () => {
  it('creates a subjectless external topic once without changing personal files or granting acceptance', async () => {
    await setup(async ({ workspaces, request, root }) => {
      writeFileSync(join(root, 'personal.txt'), 'Preserve untracked personal work.\n')
      const before = git(root, ['rev-parse', 'HEAD']),
        record = workspaces.prepare(request)
      expect(existsSync(record.repository.path)).toBe(false)
      expect(workspaces.prepare(request)).toEqual(record)
      const result = await workspaces.execute(record.digest)
      expect(result).toMatchObject({
        status: 'ready',
        current: true,
        head: before,
        acceptance: 'not-established',
        publication: 'not-performed',
      })
      expect(
        record.repository.path.startsWith(workspaces.effects.lifecycle.journal.files.root),
      ).toBe(true)
      expect(readFileSync(join(root, 'personal.txt'), 'utf8')).toBe(
        'Preserve untracked personal work.\n',
      )
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(before)
      expect((await workspaces.execute(record.digest)).status).toBe('ready')
      expect((await workspaces.reconcile(record.digest)).status).toBe('ready')
      expect(workspaces.effects.inspect(request.run)).toHaveLength(1)
    })
  })
  it('respects an original narrowed topic prefix', async () => {
    await setup(
      async ({ workspaces, request }) => {
        const record = workspaces.prepare(request)
        expect(record.repository.branch.startsWith('wl/authorized/work-')).toBe(true)
        expect((await workspaces.execute(record.digest)).status).toBe('ready')
      },
      { prefix: 'wl/authorized/' },
    )
  })
  it('merges only complete pinned code predecessors before implementation', async () => {
    await integrationFixture(async ({ store, request, root, paths }) => {
      const workspaces = new DeliveryWorkspaces(store.planning.sources.files.root),
        plan = store.planning.getPlan(request.run, request.revision).plan,
        grant = workspaces.effects.lifecycle.authority.authorize(authorization(plan, request.plan))
      workspaces.effects.lifecycle.track({ run: request.run, revision: 1, grant: grant.grant.id })
      workspaces.effects.lifecycle.transition(request.run, {
        to: 'queued',
        reason: 'Prepare the dependent unit.',
      })
      const parent = request.parts.find((part) => part.work === 'contract')
      if (!parent) throw new Error('Fixture requires a committed contract')
      const input: DeliveryWorkspaceRequest = {
        schema: 'wholeloop/delivery-workspace-request@1',
        run: request.run,
        revision: 1,
        plan: request.plan,
        unit: 'search',
        key: 'dependent',
        parts: [parent],
      }
      expect(() => workspaces.prepare({ ...input, parts: [] })).toThrow(
        'workspace-predecessor-coverage',
      )
      expect(() => workspaces.prepare({ ...input, parts: request.parts })).toThrow(
        'workspace-predecessor-coverage',
      )
      const before = git(root, ['rev-parse', 'HEAD']),
        worker = readFileSync(join(paths.search, 'search.txt'), 'utf8'),
        record = workspaces.prepare(input),
        result = await workspaces.execute(record.digest)
      expect(result.status).toBe('ready')
      expect(result.effects).toHaveLength(2)
      const inspect = vi.spyOn(workspaces.effects, 'inspect')
      expect(workspaces.inspect(record.digest).status).toBe('ready')
      expect(inspect).toHaveBeenCalledTimes(1)
      inspect.mockRestore()
      expect(readFileSync(join(record.repository.path, 'contract.json'), 'utf8')).toContain('v1')
      expect(existsSync(join(record.repository.path, 'search.txt'))).toBe(false)
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(before)
      expect(readFileSync(join(paths.search, 'search.txt'), 'utf8')).toBe(worker)
    })
  })
  it('holds a prepared unit binding instead of silently allocating a second topic', async () => {
    await setup(async ({ workspaces, request }) => {
      workspaces.prepare(request)
      expect(() => workspaces.prepare({ ...request, key: 'duplicate' })).toThrow(
        'workspace-already-bound',
      )
    })
  })
  it('refuses an oversized private unit locator before dispatch', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request)
      workspaces.effects.lifecycle.journal.files.atomic(
        `delivery/workspace-units/${request.run}/${request.plan}/${request.unit}.txt`,
        'x'.repeat(65536),
      )
      expect(workspaces.inspect(record.digest)).toMatchObject({ status: 'stale', current: false })
      expect(existsSync(record.repository.path)).toBe(false)
      expect(workspaces.effects.inspect(request.run)).toHaveLength(0)
    })
  })
  it('pins cross-repository predecessors without merging them into another repository', async () => {
    await integrationFixture(
      async ({ store, request }) => {
        const workspaces = new DeliveryWorkspaces(store.planning.sources.files.root),
          plan = store.planning.getPlan(request.run, 1).plan,
          grant = workspaces.effects.lifecycle.authority.authorize(
            authorization(plan, request.plan),
          )
        workspaces.effects.lifecycle.track({ run: request.run, revision: 1, grant: grant.grant.id })
        workspaces.effects.lifecycle.transition(request.run, {
          to: 'queued',
          reason: 'Prepare only the declared repository.',
        })
        const parent = request.parts.find((part) => part.work === 'contract')
        if (!parent) throw new Error('Fixture requires its contract predecessor')
        const record = workspaces.prepare({
          schema: 'wholeloop/delivery-workspace-request@1',
          run: request.run,
          revision: 1,
          plan: request.plan,
          unit: 'search',
          key: 'cross-repository',
          parts: [parent],
        })
        const result = await workspaces.execute(record.digest)
        expect(result.status).toBe('ready')
        expect(record.repository.repository).toBe('web')
        expect(result.effects).toHaveLength(1)
        expect(existsSync(join(record.repository.path, 'contract.json'))).toBe(false)
        writeFileSync(join(parent.path, 'contract.json'), 'Changed predecessor bytes.')
        expect(workspaces.inspect(record.digest).status).toBe('stale')
      },
      { secondRepository: true },
    )
  })
  it('recovers a missing original native outcome read without replaying checkout', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request),
        execute = workspaces.effects.execute.bind(workspaces.effects)
      let retained: string | undefined
      workspaces.effects.execute = (run, id, host) =>
        execute(run, id, {
          ...host,
          observe: async (intent, invocation, signal) => {
            const path = workspaces.effects.lifecycle.journal.files.path(
              `delivery/workspace-operations/${record.digest}/${invocation}/outcome.json`,
            )
            // The actual checkout closes normally. Lose only its first controller read,
            // preserving the original bytes so fresh reconciliation can observe them.
            if (existsSync(path)) {
              renameSync(path, `${path}.retained`)
              retained = path
            }
            return host.observe(intent, invocation, signal)
          },
        })
      const first = await workspaces.execute(record.digest)
      expect(first.status).toBe('unknown')
      expect(existsSync(record.repository.path)).toBe(true)
      expect(retained).toBeDefined()
      if (!retained) throw new Error('Fixture requires the original retained native outcome')
      renameSync(`${retained}.retained`, retained)
      const observed = await new DeliveryWorkspaces(
        workspaces.effects.lifecycle.journal.files.root,
      ).reconcile(record.digest)
      expect(observed.status).toBe('ready')
      expect(workspaces.effects.inspect(request.run)).toHaveLength(1)
      expect(workspaces.effects.lifecycle.journal.get(request.run).state).toBe('waiting-external')
    })
  })
  it('does not dispatch a prepared checkout after the operator pauses the run', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request)
      workspaces.effects.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Pause before checkout.',
      })
      await expect(workspaces.execute(record.digest)).rejects.toThrow('effect-execution-state')
      expect(existsSync(record.repository.path)).toBe(false)
      expect(
        workspaces.effects.inspect(request.run).every((effect) => effect.invocation === undefined),
      ).toBe(true)
    })
  })
  it('refuses missing original effect authority without creating an allocation', async () => {
    await setup(
      async ({ workspaces, request }) => {
        expect(() => workspaces.prepare(request)).toThrow('inactive-workspace-authority')
        expect(workspaces.effects.inspect(request.run)).toHaveLength(0)
      },
      { effects: false },
    )
  })
  it('refuses a moving base, revoked grant and changed private binding before Git mutation', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request)
      workspaces.effects.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: record.grant,
        operator: 'Fixture Operator',
        reason: 'Revoke before checkout.',
      })
      await expect(workspaces.execute(record.digest)).rejects.toThrow(
        'inactive-workspace-authority',
      )
      expect(existsSync(record.repository.path)).toBe(false)
    })
    await setup(async ({ workspaces, request, root }) => {
      const record = workspaces.prepare(request)
      writeFileSync(join(root, 'app.txt'), 'Moved named base.\n')
      git(root, ['add', 'app.txt'])
      git(root, [
        'commit',
        '-m',
        'fix: move the fixture base',
        '-m',
        'Require the original base to remain current.',
      ])
      await expect(workspaces.execute(record.digest)).rejects.toThrow()
      expect(existsSync(record.repository.path)).toBe(false)
    })
    await setup(async ({ workspaces, request, root }) => {
      const record = workspaces.prepare(request)
      workspaces.effects.lifecycle.journal.files.atomic(
        `delivery/workspaces/${record.digest}.json`,
        JSON.stringify({ ...record, repository: { ...record.repository, path: root } }),
      )
      await expect(workspaces.execute(record.digest)).rejects.toThrow('changed-workspace-record')
      expect(existsSync(record.repository.path)).toBe(false)
      expect(workspaces.effects.inspect(request.run)).toHaveLength(0)
    })
  })
  it('preserves occupied paths and refuses controller Git helper configuration', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request)
      mkdirSync(record.repository.path, { recursive: true })
      writeFileSync(join(record.repository.path, 'note.txt'), 'Preserve occupied path.')
      await expect(workspaces.execute(record.digest)).rejects.toThrow('occupied-delivery-workspace')
      expect(readFileSync(join(record.repository.path, 'note.txt'), 'utf8')).toBe(
        'Preserve occupied path.',
      )
    })
    await setup(async ({ workspaces, request, root }) => {
      git(root, ['config', 'core.fsmonitor', 'untrusted-helper'])
      expect(() => workspaces.prepare(request)).toThrow('controller-git-helper-unavailable')
    })
  })
  it('keeps a legitimate dirty owned candidate separate from initial creation and QA', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request),
        before = await workspaces.execute(record.digest)
      writeFileSync(join(record.repository.path, 'app.txt'), 'Candidate change.\n')
      const after = workspaces.inspect(record.digest)
      expect(after.status).toBe('ready')
      expect(after.snapshot).not.toBe(before.snapshot)
      expect(after.acceptance).toBe('not-established')
      expect(workspaces.effects.inspect(request.run)).toHaveLength(1)
    })
  })
  it('bounds untrusted owned candidate files before claiming current readiness', async () => {
    await setup(async ({ workspaces, request }) => {
      const record = workspaces.prepare(request)
      expect((await workspaces.execute(record.digest)).status).toBe('ready')
      writeFileSync(
        join(record.repository.path, 'oversized.bin'),
        Buffer.alloc(ENVIRONMENT_SNAPSHOT_LIMITS.maxFileBytes + 1),
      )
      expect(workspaces.inspect(record.digest)).toMatchObject({
        status: 'stale',
        current: false,
        acceptance: 'not-established',
      })
      expect(workspaces.effects.inspect(request.run)).toHaveLength(1)
    })
  })
})
