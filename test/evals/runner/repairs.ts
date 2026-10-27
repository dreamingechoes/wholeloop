import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { git as gitRead } from '../../../src/worktrees/git.js'
import { runnerRepairFixture } from '../../support/runner-repair.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
const workspaceHead = (workspace: string) => gitRead(workspace, ['rev-parse', 'HEAD']).trim()
for (const mode of ['complete', 'lost-claim'] as const) {
  await runnerRepairFixture(async ({ store, queue, options, request, reader, context, host }) => {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 120000)
    context.signal = abort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + 120000),
    ).toISOString()
    try {
      const repair = new RunnerRepairWorkers(store, queue, options),
        scope = new RunnerNativeScope(store.files, context.invocation),
        calls = scope.calls().length,
        before = findBudget(store.lifecycle.journal.get(request.run)),
        original = queue.claim.bind(queue)
      let claims = 0
      if (mode === 'lost-claim')
        queue.claim = (...args) => {
          claims++
          assert.equal(original(...args).assignment?.generation, 2)
          throw new Error('Lose the response after committing the correction reservation')
        }
      const result = await repair.execute(reader, context)
      assert.equal(
        result.status,
        mode === 'complete' ? 'produced' : 'unknown',
        JSON.stringify(result),
      )
      assert.equal(result.commit, 'pending')
      assert.equal(result.qa, 'pending')
      const entries = queue.inspect(request.run).filter((entry) => entry.role === 'builder')
      assert.equal(entries.length, 1)
      assert.equal(entries[0]?.generation, 2)
      assert.equal(entries[0]?.status, mode === 'complete' ? 'complete' : 'claimed')
      const builders = deliveryAttempts(store.lifecycle.journal.get(request.run)).records.filter(
        (attempt) => attempt.role === 'builder',
      )
      assert.equal(builders.length, 2)
      assert.equal(builders[0]?.state, 'fenced')
      const budget = findBudget(store.lifecycle.journal.get(request.run))
      assert.equal(budget?.reservations.length, (before?.reservations.length ?? 0) + 1)
      assert.equal(budget?.deadline, before?.deadline)
      assert.equal(budget?.failures.length, 1)
      assert.deepEqual(budget?.progress, before?.progress)
      assert.equal(store.stage(contractDigest(request), context.stage.id)?.status, 'running')
      assert.equal(scope.calls().length, calls + (mode === 'complete' ? 1 : 0))
      if (mode === 'complete') {
        const lease = queue.assigned(request.run, entries[0]?.attempt ?? ''),
          binding = repair.native.binding(lease),
          brief = JSON.parse(binding?.assignment.brief ?? '{}')
        assert.equal(binding?.assignment.deadline, context.deadline)
        assert.equal(brief.task.kind, 'repair')
        assert.equal(JSON.parse(brief.task.prompt).feedback.category, 'review-findings')
        assert.equal(JSON.parse(brief.task.prompt).feedback.origin.invocation, context.invocation)
        const workspace = host.workspace(request, 'search').repository.path,
          path = join(workspace, 'app.txt'),
          current = readFileSync(path)
        assert.equal(current.toString(), 'Synthetic owned correction.\n')
        writeFileSync(path, 'Changed after correction.\n')
        assert.equal((await repair.inspect(request, context.invocation)).status, 'blocked')
        writeFileSync(path, current)
      }
      store.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Inspect only the original correction.',
      })
      options.context = () => {
        throw new Error('Recovery cannot select inputs')
      }
      options.boundary = () => {
        throw new Error('Recovery cannot construct another host')
      }
      const recovered = new RunnerRepairWorkers(store, queue, options)
      for (let index = 0; index < 2; index++) {
        const observed = await recovered.execute(reader, context)
        if (mode === 'complete') assert.deepEqual(observed, result)
        else assert.equal(observed.status, 'unknown')
      }
      assert.equal(scope.calls().length, calls + (mode === 'complete' ? 1 : 0))
      assert.equal(claims, mode === 'lost-claim' ? 1 : 0)
      if (mode === 'complete') {
        store.lifecycle.transition(request.run, {
          to: 'queued',
          reason: 'Commit only the original retained correction.',
        })
        const commits = new RunnerRepairCommits(recovered),
          committed = await commits.execute(context)
        assert.equal(committed.status, 'committed', JSON.stringify(committed))
        assert.equal(committed.qa, 'pending')
        assert.equal(committed.candidateChain, 'pending')
        if (!('receipt' in committed)) throw new Error('Original correction receipt required')
        assert.equal(
          committed.receipt.parent,
          JSON.parse(
            JSON.parse(
              recovered.native.binding(queue.assigned(request.run, entries[0]?.attempt ?? ''))
                ?.assignment.brief ?? '{}',
            ).task.prompt,
          ).feedback.origin.candidate,
        )
        assert.equal(
          committed.receipt.head,
          workspaceHead(host.workspace(request, 'search').repository.path),
        )
        assert.equal(store.stage(contractDigest(request), context.stage.id)?.status, 'running')
        assert.throws(() => host.candidate(request, 'search'), /git-stage-candidate-not-current/)
        assert.deepEqual(host.candidate(request, 'search', commits).receipt, committed.receipt)
        const allocation = host.workspace(request, 'search')
        gitRead(allocation.repository.root, ['worktree', 'lock', allocation.repository.path])
        try {
          assert.throws(
            () => host.candidate(request, 'search', commits),
            /original-correction-head-not-current/,
          )
        } finally {
          gitRead(allocation.repository.root, ['worktree', 'unlock', allocation.repository.path])
        }
        assert.deepEqual(host.candidate(request, 'search', commits).receipt, committed.receipt)
        assert.throws(
          () => commits.candidate(request, 'search', 'f'.repeat(64)),
          /original-correction-parent-binding/,
        )
        assert.equal(scope.calls().length, calls + 1)
        const effects = commits.commits.effects
          .inspect(request.run)
          .filter((effect) =>
            effect.intent.key.startsWith(`candidate-${committed.receipt.record}-`),
          )
        assert.equal(effects.length, 2)
        assert.ok(
          effects.every(
            (effect) =>
              effect.status === 'applied' &&
              effect.observations.at(-1)?.invocationState === 'stopped',
          ),
        )
        const headPath = store.files.path(
          `delivery/workspace-heads/${committed.receipt.workspace}.txt`,
        )
        renameSync(headPath, `${headPath}.lost`)
        store.lifecycle.transition(request.run, {
          to: 'paused',
          reason: 'Recover the original correction commit without new Git dispatch.',
        })
        const restored = await new RunnerRepairCommits(recovered).inspect(
          request,
          context.invocation,
        )
        assert.equal(restored.status, 'committed', JSON.stringify(restored))
        if (!('receipt' in restored))
          throw new Error('Recovered original correction receipt required')
        assert.deepEqual(restored.receipt, committed.receipt)
        assert.equal(
          commits.commits.effects
            .inspect(request.run)
            .filter((effect) =>
              effect.intent.key.startsWith(`candidate-${committed.receipt.record}-`),
            ).length,
          2,
        )
        const path = join(host.workspace(request, 'search').repository.path, 'app.txt'),
          bytes = readFileSync(path)
        writeFileSync(path, 'Changed after correction commit.\n')
        assert.throws(
          () => host.candidate(request, 'search', commits),
          /original-correction-head-not-current/,
        )
        assert.equal((await commits.inspect(request, context.invocation)).status, 'blocked')
        writeFileSync(path, bytes)
        assert.equal((await commits.inspect(request, context.invocation)).status, 'committed')
        assert.deepEqual(host.candidate(request, 'search', commits).receipt, committed.receipt)
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Keep original private cancellation available.',
        })
        recovered.stop(request, context.invocation)
        commits.stop(request, context.invocation)
        checks.push(
          'original correction commit and explicit successor retain the original parent, refuse unrelated or changed heads and recover a lost locator while paused with QA pending',
        )
      }
      checks.push(
        mode === 'complete'
          ? 'one original bounded correction preserves failure, generation, pending commit/QA and paused recovery without replay'
          : 'lost original correction claim response retains reservation and intent without reclaim or native dispatch',
      )
    } finally {
      clearTimeout(timer)
    }
  })
}
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nativeAcceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
