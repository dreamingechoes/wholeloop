import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryCommits } from '../../../src/delivery/commits.js'
import type { QueueAssignment } from '../../../src/delivery/queue.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { runnerCorrectionFixture } from '../../support/runner-correction.js'

it('retains original correction production after fencing and a later owned commit without approving its head', async () => {
  await runnerCorrectionFixture(
    async ({ store, request, host, corrections, context, production }) => {
      const record = store.stage(contractDigest(request), context.stage.id)
      if (!record) throw new Error('Original correction record required')
      const original = await corrections.inspect(request, record),
        candidate = host.candidate(request, 'search'),
        lease = JSON.parse(
          readFileSync(
            store.files.path(`delivery/runner-corrections/${context.invocation}/lease.json`),
            'utf8',
          ),
        ) as QueueAssignment
      expect(original.status).toBe('passed')
      production.queue.fence(lease)
      const journal = contractDigest(store.lifecycle.journal.events())
      expect(await corrections.inspect(request, record)).toEqual(original)
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
      expect(production.workers.native.completed(lease)).toBe(false)
      const path = candidate.allocation.repository.path
      writeFileSync(join(path, 'app.txt'), 'A later separately owned change.\n')
      const snapshot = workspaceSnapshot(path),
        commits = new DeliveryCommits(store.files.root),
        next = commits.prepare({
          schema: 'wholeloop/delivery-commit-request@1',
          workspace: candidate.allocation.digest,
          key: 'later-owned-control',
          head: snapshot.head,
          snapshot: snapshot.digest,
          message:
            'test: move the owned head\n\nProve production history remains distinct from current candidate eligibility.',
        })
      expect((await commits.execute(next.digest)).status).toBe('committed')
      expect(await corrections.inspect(request, record)).toEqual(original)
      expect(() => host.candidate(request, 'search')).toThrow()
      const base = `delivery/runner-corrections/${context.invocation}`,
        bindingPath = store.files.path(`${base}/binding.json`),
        commitPath = store.files.path(`${base}/commit.txt`),
        binding = readFileSync(bindingPath),
        commit = readFileSync(commitPath),
        changed = JSON.parse(binding.toString('utf8'))
      changed.feedback.reason = 'Substituted correction explanation.'
      writeFileSync(bindingPath, JSON.stringify(changed))
      expect((await corrections.inspect(request, record)).status).toBe('unknown')
      expect(() => corrections.stop(request, record, new AbortController().signal)).not.toThrow()
      writeFileSync(bindingPath, binding)
      writeFileSync(commitPath, next.digest)
      expect((await corrections.inspect(request, record)).status).toBe('unknown')
      writeFileSync(commitPath, commit)
      expect(await corrections.inspect(request, record)).toEqual(original)
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: request.grant,
        operator: 'Fixture Operator',
        reason: 'Historical production cannot restore current revoked authority.',
      })
      expect((await corrections.inspect(request, record)).status).toBe('unknown')
      expect(() => corrections.stop(request, record, new AbortController().signal)).not.toThrow()
    },
  )
}, 120000)

it('refuses a borrowed native cancellation scope before requesting control', async () => {
  await runnerCorrectionFixture(async ({ store, request, corrections, context }) => {
    const record = store.stage(contractDigest(request), context.stage.id)
    if (!record) throw new Error('Original correction record required')
    expect(() =>
      corrections.stop(
        request,
        { ...record, invocation: 'a'.repeat(64) },
        new AbortController().signal,
      ),
    ).toThrow('correction-stage-binding')
  })
}, 120000)
