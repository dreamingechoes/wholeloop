import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { gateRuns } from '../../../src/gates/state.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = [],
  unchanged = process.argv.includes('--unchanged'),
  environments: string[] = []
await runnerSuiteFixture(
  async ({ store, context, engine, selection, driver, production, dispatch, observe, gate }) => {
    assert.ok(production)
    console.log(`Retained original store: ${store.files.root}`)
    // One finite window covers verification, review, correction and re-entry.
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 360000),
      bound = (stage: ReturnType<typeof dispatch>) => {
        stage.signal = abort.signal
        stage.deadline = new Date(
          Math.min(Date.parse(stage.deadline), Date.now() + 360000),
        ).toISOString()
        return stage
      },
      digest = contractDigest(context.request),
      workspace = gate.repository
    environments.push(selection.environment)
    try {
      const verifier = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: gateWorkerFixture(store, workspace, 'valid', 'host-observed'),
        }),
        verified = await verifier.execute(bound(context))
      assert.equal(verified.status, 'passed', JSON.stringify(verified))
      observe(verified)
      const original = gateRuns(engine.store.events()).at(-1)
      assert.ok(original)
      assert.equal(original.rounds.length, 1)
      console.log('Original verification passed on its first round')
      const reviewContext = bound(dispatch('review:search')),
        reviewer = new RunnerReviewStages(store, {
          identity: context.request.host,
          engine: () => engine,
          gate: gateWorkerFixture(
            store,
            workspace,
            unchanged ? 'valid' : 'repair-aware',
            'host-observed',
          ),
        })
      let reviewed = await reviewer.execute(reviewContext),
        finalReviewer = reviewer,
        correction: RunnerRepairCommits | undefined,
        head = new RunnerGitStages(store).candidate(context.request, 'search').receipt.head
      if (!unchanged) {
        assert.equal(reviewed.status, 'blocked', JSON.stringify(reviewed))
        const repair = new RunnerRepairWorkers(store, production.queue, production.options)
        assert.equal((await repair.execute(reviewer, reviewContext)).status, 'produced')
        correction = new RunnerRepairCommits(repair)
        const committed = await correction.execute(reviewContext)
        assert.equal(committed.status, 'committed', JSON.stringify(committed))
        if (!('receipt' in committed)) throw new Error('Review correction receipt required')
        head = committed.receipt.head
        finalReviewer = new RunnerReviewStages(store, { ...reviewer.options, correction })
        reviewed = await finalReviewer.advance(reviewContext)
        console.log('Review finding corrected and committed')
      }
      assert.equal(reviewed.status, 'passed', JSON.stringify(reviewed))
      assert.equal(reviewed.provenance, 'host-observed')
      observe(reviewed)
      assert.ok(head)
      const before = await new RunnerUnitReadiness(
        new RunnerVerificationStages(store, {
          ...verifier.options,
          ...(correction ? { correction } : {}),
        }),
        finalReviewer,
      ).inspect(context.request, 'search')
      if (unchanged) assert.equal(before.status, 'ready', JSON.stringify(before))
      else {
        assert.notEqual(before.status, 'ready', JSON.stringify(before))
        checks.push(
          'the original verification no longer attests the review-corrected head, so unit readiness refuses before re-entry',
        )
      }
      let suite = selection
      if (!unchanged) {
        const first = new EnvironmentResources(store.files).get(selection.environment).record,
          prepared = await new DeliveryEnvironments(store.files.root, driver).provision({
            schema: 'wholeloop/environment-provision-request@1',
            run: context.request.run,
            recipe: first.recipe,
            key: 'review-corrected-reentry',
            helperImage: first.helperImage,
            workspaces: [
              {
                repository: 'app',
                path: workspace,
                head,
                snapshot: workspaceSnapshot(workspace).digest,
              },
            ],
          })
        assert.equal(prepared.status, 'ready', JSON.stringify(prepared))
        assert.ok(prepared.environment)
        environments.push(prepared.environment.record.id)
        suite = { ...selection, environment: prepared.environment.record.id }
        store.lifecycle.transition(context.request.run, {
          to: 'queued',
          reason: 'Continue original re-entry after fresh environment readiness.',
        })
      }
      const verifyRuns = gateRuns(engine.store.events()).filter(
          (run) => run.gate === 'verify',
        ).length,
        reentryContext = bound(dispatch('reverification:search')),
        reentry = new RunnerVerificationStages(store, {
          ...verifier.options,
          suite: () => suite,
          ...(correction ? { correction } : {}),
        }),
        result = await reentry.execute(reentryContext)
      assert.equal(result.status, 'passed', JSON.stringify(result))
      assert.equal(result.provenance, 'host-observed')
      observe(result)
      const runs = gateRuns(engine.store.events()),
        scope = new RunnerNativeScope(store.files, reentryContext.invocation),
        calls = scope.calls().length,
        originalRun = runs.find((run) => run.run === original.run)
      assert.equal(originalRun?.rounds.length, 1)
      assert.equal(originalRun?.rounds[0]?.decision?.report.verdict, 'PASS')
      if (unchanged) {
        assert.equal(calls, 0)
        assert.equal(runs.filter((run) => run.gate === 'verify').length, verifyRuns)
        checks.push(
          'an unchanged reviewed head is attested by the original verification with no suite, model, gate round or environment',
        )
      } else {
        const fresh = runs.filter((run) => run.gate === 'verify').at(-1)
        assert.ok(fresh)
        assert.equal(runs.filter((run) => run.gate === 'verify').length, verifyRuns + 1)
        assert.notEqual(fresh.subject, original.subject)
        assert.equal(fresh.rounds.length, 1)
        assert.equal(fresh.rounds[0]?.plan.snapshot.head, head)
        assert.equal(fresh.rounds[0]?.decision?.report.verdict, 'PASS')
        assert.ok(calls > 0)
        checks.push(
          'the review-corrected head receives a fresh actual suite and verification round on its own subject and environment, leaving the original verification run unchanged',
        )
      }
      const ready = await new RunnerUnitReadiness(reentry, finalReviewer).inspect(
        context.request,
        'search',
      )
      assert.equal(ready.status, 'ready', JSON.stringify(ready))
      assert.equal(ready.candidate?.head, head)
      checks.push('unit readiness accepts the re-entry that attests the exact reviewed head')
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Recover the original re-entry without repeating work.',
      })
      const journal = contractDigest(store.lifecycle.journal.events()),
        record = store.stage(digest, reentryContext.stage.id)
      assert.ok(record)
      const recovered = new RunnerVerificationStages(new RunnerStore(store.files.root), {
        ...reentry.options,
        suite: () => {
          throw new Error('Recovery cannot select a suite')
        },
        gate: () => {
          throw new Error('Recovery cannot construct a native host')
        },
      })
      assert.deepEqual(await recovered.inspect(context.request, record), result)
      assert.equal(scope.calls().length, calls)
      assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
      checks.push(
        'paused re-entry recovery reopens the same observation without a suite, model or journal change',
      )
      if (process.argv.includes('--retire-success')) {
        const resources = new EnvironmentResources(store.files),
          lifecycle = new EnvironmentLifecycle(store.files, driver)
        for (const id of environments) {
          if (resources.get(id).record.state === 'retired') continue
          const retired = await lifecycle.execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `reentry-${id}`,
            environment: id,
            expected: resources.get(id).digest,
            action: 'retire',
            reason: 'Retire only the exact original re-entry evaluation environment.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
        }
        checks.push(`${environments.length} exact observed environments retire`)
      }
    } finally {
      clearTimeout(timer)
    }
  },
  { backend: 'docker', production: true, unattended: true, retain: true },
)
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
