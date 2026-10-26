import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { candidateIndex } from '../../../src/delivery/candidate-files.js'
import { workspaceCommitPath } from '../../../src/delivery/commit-state.js'
import { DeliveryCommits } from '../../../src/delivery/commits.js'
import { git } from '../../support/delivery.js'
import {
  fixtureCommitMessage as message,
  prepareFixtureCommit as prepare,
  deliveryCommitFixture as setup,
} from '../../support/delivery-commits.js'

describe('owned candidate staging and topic commits', () => {
  it('refuses message attribution and command substitution before recording a candidate', async () => {
    await setup(async ({ commits, workspace, path }) => {
      writeFileSync(join(path, 'app.txt'), 'Owned change.\n')
      const status = commits.workspaces.inspect(workspace)
      const input = {
        schema: 'wholeloop/delivery-commit-request@1',
        workspace,
        key: 'invalid-message',
        head: status.head,
        snapshot: status.snapshot,
      }
      for (const body of ['Co-Authored-By: assistant', `${String.fromCharCode(36)}(env)`])
        expect(() =>
          commits.prepare({ ...input, message: `feat: pin the fixture\n\n${body}` }),
        ).toThrow('message-hygiene')
      expect(commits.effects.inspect(status.record.request.run)).toHaveLength(1)
    })
  })
  it('preserves an unknown transformed index without committing or reissuing staging', async () => {
    await setup(async ({ commits, workspace, path, root }) => {
      git(root, ['config', 'core.autocrlf', 'true'])
      writeFileSync(join(path, 'crlf.txt'), 'A\r\nB\r\n')
      const record = prepare(commits, workspace),
        head = git(path, ['rev-parse', 'HEAD'])
      expect((await commits.execute(record.digest)).status).toBe('unknown')
      expect((await commits.execute(record.digest)).status).toBe('unknown')
      expect(git(path, ['rev-parse', 'HEAD'])).toBe(head)
      const effects = commits.effects.inspect(record.run)
      expect(effects).toHaveLength(2)
      expect(effects.at(-1)?.observations.at(-1)).toMatchObject({
        status: 'unknown',
        invocationState: 'stopped',
      })
      expect(
        existsSync(commits.effects.lifecycle.journal.files.path(workspaceCommitPath(workspace))),
      ).toBe(false)
    })
  })
  it('refuses changed candidate bytes before the staging process starts', async () => {
    await setup(async ({ commits, workspace, path }) => {
      writeFileSync(join(path, 'app.txt'), 'Pinned candidate.\n')
      const record = prepare(commits, workspace),
        index = candidateIndex(path)
      writeFileSync(join(path, 'app.txt'), 'Changed after preparation.\n')
      await expect(commits.execute(record.digest)).rejects.toThrow('candidate-changed')
      expect(candidateIndex(path)).toBe(index)
      expect(
        commits.effects
          .inspect(record.run)
          .every((effect) => effect.intent.operation === 'workspace.create' || !effect.invocation),
      ).toBe(true)
    })
  })
  it.each(['paused', 'revoked'] as const)(
    'fences a %s original run before candidate mutation',
    async (mode) => {
      await setup(async ({ commits, workspace, path }) => {
        writeFileSync(join(path, 'app.txt'), 'Authorized candidate.\n')
        const record = prepare(commits, workspace),
          index = candidateIndex(path)
        if (mode === 'paused')
          commits.effects.lifecycle.transition(record.run, {
            to: 'paused',
            reason: 'Pause before staging.',
          })
        else
          commits.effects.lifecycle.authority.revoke({
            schema: 'wholeloop/delivery-revocation-request@1',
            grant: record.grant,
            operator: 'Fixture Operator',
            reason: 'Revoke before staging.',
          })
        await expect(commits.execute(record.digest)).rejects.toThrow(
          mode === 'paused' ? 'effect-execution-state' : 'inactive-workspace-authority',
        )
        expect(candidateIndex(path)).toBe(index)
        expect(
          commits.effects
            .inspect(record.run)
            .every(
              (effect) => effect.intent.operation === 'workspace.create' || !effect.invocation,
            ),
        ).toBe(true)
      })
    },
  )
  it('refuses fixture provenance before publishing a committed head locator', async () => {
    await setup(async ({ commits, workspace, path }) => {
      writeFileSync(join(path, 'app.txt'), 'Fixture-labelled candidate.\n')
      const record = prepare(commits, workspace),
        execute = commits.effects.execute.bind(commits.effects)
      commits.effects.execute = (run, id, host) =>
        execute(run, id, {
          ...host,
          eligible: (intent) => ({ ...host.eligible(intent), provenance: 'fixture' }),
          observe: async (intent, invocation, signal) => {
            const result = await host.observe(intent, invocation, signal)
            return result.available
              ? { available: true, value: { ...result.value, provenance: 'fixture' } }
              : result
          },
        })
      await expect(commits.execute(record.digest)).rejects.toThrow('head-native-evidence')
      expect(
        existsSync(commits.effects.lifecycle.journal.files.path(workspaceCommitPath(workspace))),
      ).toBe(false)
      expect(commits.effects.inspect(record.run)).toHaveLength(3)
    })
  })
  it('commits exact changed/new bytes once and advances only the owned head', async () => {
    await setup(async ({ commits, workspace, path, root }) => {
      const base = git(root, ['rev-parse', 'HEAD'])
      writeFileSync(join(path, 'app.txt'), 'Owned implementation.\n')
      writeFileSync(join(path, 'new.txt'), 'New fixture source.\n')
      const record = prepare(commits, workspace)
      expect(commits.inspect(record.digest).status).toBe('prepared')
      const result = await commits.execute(record.digest)
      expect(result).toMatchObject({
        status: 'committed',
        current: true,
        acceptance: 'not-established',
        publication: 'not-performed',
      })
      expect(result.receipt?.parent).toBe(base)
      expect(result.receipt?.head).not.toBe(base)
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(base)
      expect(git(path, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('')
      expect(git(path, ['log', '-1', '--format=%B']).trim()).toBe(message)
      expect(commits.workspaces.inspect(workspace)).toMatchObject({
        status: 'ready',
        head: result.receipt?.head,
      })
      expect((await commits.execute(record.digest)).status).toBe('committed')
      expect(commits.prepare(record.request)).toEqual(record)
      expect(commits.effects.inspect(record.run)).toHaveLength(3)
    })
  })
  it('keeps an ordinary no-change commit failure distinct from success and never retries it', async () => {
    await setup(async ({ commits, workspace, path }) => {
      const record = prepare(commits, workspace),
        head = git(path, ['rev-parse', 'HEAD'])
      expect((await commits.execute(record.digest)).status).toBe('failed')
      expect((await commits.execute(record.digest)).status).toBe('failed')
      expect(git(path, ['rev-parse', 'HEAD'])).toBe(head)
      expect(commits.effects.inspect(record.run)).toHaveLength(3)
    })
  })
  it('recovers the published native commit after a lost head locator without another Git invocation', async () => {
    await setup(async ({ commits, workspace, path }) => {
      writeFileSync(join(path, 'app.txt'), 'Candidate awaiting locator recovery.\n')
      const record = prepare(commits, workspace),
        files = commits.effects.lifecycle.journal.files,
        atomic = files.atomic.bind(files)
      let interrupted = false
      files.atomic = (name, body) => {
        if (!interrupted && name === workspaceCommitPath(workspace)) {
          interrupted = true
          throw new Error('Injected commit locator write failure')
        }
        atomic(name, body)
      }
      await expect(commits.execute(record.digest)).rejects.toThrow(
        'Injected commit locator write failure',
      )
      expect(interrupted).toBe(true)
      expect(existsSync(files.path(workspaceCommitPath(workspace)))).toBe(false)
      expect(commits.workspaces.inspect(workspace).status).toBe('stale')
      commits.effects.lifecycle.transition(record.run, {
        to: 'paused',
        reason: 'Observe recovery without resuming execution.',
      })
      const observed = await new DeliveryCommits(files.root).reconcile(record.digest)
      expect(observed.status).toBe('committed')
      expect(commits.effects.inspect(record.run)).toHaveLength(3)
      expect(commits.effects.lifecycle.journal.get(record.run).state).toBe('paused')
      expect(readFileSync(join(path, 'app.txt'), 'utf8')).toBe(
        'Candidate awaiting locator recovery.\n',
      )
    })
  })
  it('prepares a repair against the known previous commit and fences the old head receipt', async () => {
    await setup(async ({ commits, workspace, path }) => {
      writeFileSync(join(path, 'app.txt'), 'First candidate.\n')
      const first = prepare(commits, workspace),
        firstResult = await commits.execute(first.digest)
      writeFileSync(join(path, 'app.txt'), 'Second repaired candidate.\n')
      const second = prepare(commits, workspace, 'repair')
      expect(second.request.head).toBe(firstResult.receipt?.head)
      expect(commits.inspect(second.digest).status).toBe('prepared')
      const result = await commits.execute(second.digest)
      expect(result).toMatchObject({ status: 'committed', current: true })
      expect(commits.inspect(first.digest)).toMatchObject({ status: 'stale', current: false })
      await expect(commits.reconcile(first.digest)).rejects.toThrow('unpublished-or-superseded')
      expect(commits.workspaces.inspect(workspace).head).toBe(result.receipt?.head)
      const files = commits.effects.lifecycle.journal.files,
        locator = files.path(workspaceCommitPath(workspace))
      renameSync(locator, `${locator}.retained`)
      await expect(commits.reconcile(first.digest)).rejects.toThrow('unpublished-or-superseded')
      expect(existsSync(locator)).toBe(false)
      const recovered = await new DeliveryCommits(files.root).reconcile(second.digest)
      expect(recovered.receipt?.digest).toBe(result.receipt?.digest)
      expect(commits.effects.inspect(second.run)).toHaveLength(5)
    })
  })
})
