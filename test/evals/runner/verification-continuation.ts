import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { admitRunnerRepair } from '../../../src/runner/repair-admission.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { runnerRepairFeedback } from '../../../src/runner/repair-feedback.js'
import { runnerRepairStreak } from '../../../src/runner/repair-progress.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import {
  RunnerUnitReadiness,
  type RunnerUnitReadinessResult,
} from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { StateStore } from '../../../src/state/store.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = [],
  extraEnvironments: string[] = [],
  retiredEnvironments = new Set<string>(),
  predecessorReadiness = process.argv.includes('--predecessor-readiness'),
  reopenCheckpoint = process.argv.includes('--reopen-checkpoint') || predecessorReadiness,
  unitReadiness = process.argv.includes('--unit-readiness') || reopenCheckpoint,
  reviewAfterVerification = process.argv.includes('--review-after-verification') || unitReadiness,
  repeatVerification = process.argv.includes('--repeat-verification') || reviewAfterVerification,
  secondCorrection = process.argv.includes('--second-correction') || repeatVerification,
  repeated = process.argv.includes('--repeated-failure') || secondCorrection
await runnerSuiteFixture(
  async ({
    store,
    context,
    engine,
    selection,
    driver,
    production,
    dispatch,
    observe,
    gate: initial,
  }) => {
    assert.ok(production)
    console.log(`Retained original store: ${store.files.root}`)
    // The deeper three-round composition declares its finite window before any QA.
    const window = repeatVerification ? 360000 : 240000,
      abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), window)
    context.signal = abort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + window),
    ).toISOString()
    try {
      const options = gateWorkerFixture(store, initial.repository, 'valid', 'host-observed'),
        original = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: options,
        })
      assert.equal((await original.execute(context)).status, 'blocked')
      const before = findBudget(store.lifecycle.journal.get(context.request.run)),
        first = gateRuns(engine.store.events()).at(-1)
      assert.ok(first)
      context.deadline = new Date(Date.parse(context.deadline) - 1000).toISOString()
      const repair = new RunnerRepairWorkers(store, production.queue, production.options)
      assert.equal((await repair.execute(original, context)).status, 'produced')
      const commits = new RunnerRepairCommits(repair),
        committed = await commits.execute(context)
      assert.equal(committed.status, 'committed', JSON.stringify(committed))
      if (!('receipt' in committed)) throw new Error('Correction receipt required')
      console.log('Original failing candidate corrected and committed')
      const resources = new EnvironmentResources(store.files),
        firstEnvironment = resources.get(selection.environment).record,
        environments = new DeliveryEnvironments(store.files.root, driver),
        prepared = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: context.request.run,
          recipe: firstEnvironment.recipe,
          key: 'verification-continuation',
          helperImage: firstEnvironment.helperImage,
          workspaces: [
            {
              repository: 'app',
              path: initial.repository,
              head: committed.receipt.head,
              snapshot: workspaceSnapshot(initial.repository).digest,
            },
          ],
        })
      assert.equal(prepared.status, 'ready', JSON.stringify(prepared))
      assert.ok(prepared.environment)
      const environment = prepared.environment.record.id
      store.lifecycle.transition(context.request.run, {
        to: 'queued',
        reason: 'Continue exact original verification after fresh environment readiness.',
      })
      const continued = new RunnerVerificationStages(store, {
          ...original.options,
          correction: commits,
          suite: () => ({ ...selection, environment }),
        }),
        scope = new RunnerNativeScope(store.files, context.invocation),
        beforeCalls = scope.calls().length,
        plan = GateWorkflow.prototype.plan
      GateWorkflow.prototype.plan = function (...args) {
        const selected = plan.apply(this, args)
        if (selected.plan.gate === 'verify' && selected.plan.round === 2)
          throw new Error('Lose the original verification planning response')
        return selected
      }
      try {
        await assert.rejects(
          () => continued.advance(context),
          /Lose the original verification planning response/,
        )
      } finally {
        GateWorkflow.prototype.plan = plan
      }
      assert.equal(scope.calls().length, beforeCalls)
      const atomic = engine.store.files.atomic.bind(engine.store.files)
      let lostVerdict = false
      engine.store.files.atomic = (path, body) => {
        if (
          !lostVerdict &&
          path.endsWith('.ndjson') &&
          typeof body === 'string' &&
          body.includes('gate.decided') &&
          body
            .trim()
            .split('\n')
            .some((line) => {
              const event = JSON.parse(line)
              return event.type === 'gate.decided' && event.data.round === 2
            })
        ) {
          lostVerdict = true
          throw new Error('Lose the original continued verification verdict')
        }
        return atomic(path, body)
      }
      try {
        await assert.rejects(async () => {
          const observed = await continued.advance(context)
          mkdirSync(destination, { recursive: true })
          writeFileSync(
            join(destination, 'unexpected-continuation.json'),
            `${JSON.stringify(observed, null, 2)}\n`,
          )
          return observed
        }, /Lose the original continued verification verdict/)
      } finally {
        engine.store.files.atomic = atomic
      }
      assert.equal(lostVerdict, true)
      console.log(
        repeated
          ? 'The corrected candidate retains its known observed suite failure'
          : 'Corrected candidate passed its actual suite and independent synthetic judgments',
      )
      const calls = scope.calls().length
      assert.equal(repeated ? calls === beforeCalls : calls > beforeCalls, true)
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Recover exact continued verification without any new host.',
      })
      continued.options.gate = () => {
        throw new Error('Recovery cannot construct another native host')
      }
      continued.options.suite = () => {
        throw new Error('Recovery cannot select another suite')
      }
      const pointer = store.files.path(`delivery/runner-verifications/${context.invocation}.json`)
      renameSync(pointer, `${pointer}.lost`)
      const recovered = new RunnerVerificationStages(store, continued.options),
        observation = await recovered.advance(context)
      mkdirSync(destination, { recursive: true })
      writeFileSync(join(destination, 'recovery.json'), `${JSON.stringify(observation, null, 2)}\n`)
      assert.equal(observation.status, repeated ? 'blocked' : 'passed', JSON.stringify(observation))
      assert.equal(observation.provenance, 'host-observed')
      const run = gateRuns(engine.store.events()).find((run) => run.run === first.run),
        budget = findBudget(store.lifecycle.journal.get(context.request.run))
      assert.equal(run?.rounds.length, 2)
      assert.equal(run?.budget, first.budget)
      assert.equal(run?.rounds[1]?.decision?.report.verdict === 'PASS', !repeated)
      assert.equal(run?.rounds[1]?.plan.snapshot.head, committed.receipt.head)
      assert.equal(scope.calls().length, calls)
      assert.equal(budget?.deadline, before?.deadline)
      assert.equal(budget?.failures.length, 1)
      assert.equal(
        store.stage(contractDigest(context.request), context.stage.id)?.status,
        'running',
      )
      if (repeated) {
        const firstFingerprint = repair.production(context.request, context.invocation).binding
            .admission.feedback.fingerprint,
          feedback = await runnerRepairFeedback(
            recovered,
            context.request,
            store.stage(contractDigest(context.request), context.stage.id) ??
              (() => {
                throw new Error('Original stage missing')
              })(),
          )
        assert.equal(feedback.status, 'actionable', JSON.stringify(feedback))
        if (feedback.status !== 'actionable') throw new Error('Current original feedback required')
        assert.equal(feedback.fingerprint, firstFingerprint)
        assert.equal(feedback.origin.commit, committed.receipt.digest)
        assert.equal(feedback.origin.round, 2)
        store.lifecycle.transition(context.request.run, {
          to: 'queued',
          reason: 'Account for the exact repeated failure without another correction.',
        })
        if (secondCorrection) {
          const reservations = store.budgets.inspect(context.request.run).reservations.length,
            parentProduction = repair.production(context.request, context.invocation),
            parent = new RunnerRepairCommits(repair),
            next = RunnerRepairWorkers.after(
              parent,
              context.request,
              context.invocation,
              committed.receipt.digest,
            ),
            produced = await next.execute(recovered, context)
          assert.equal(produced.status, 'produced', JSON.stringify(produced))
          assert.equal(produced.commit, 'pending')
          assert.equal(produced.qa, 'pending')
          const production = next.production(context.request, context.invocation)
          assert.equal(production.lease.generation, 3)
          assert.equal(production.binding.version, 2)
          assert.equal(production.binding.after, committed.receipt.digest)
          assert.equal(
            store.budgets.inspect(context.request.run).reservations.length,
            reservations + 1,
          )
          assert.equal(scope.calls().length, calls + 1)
          assert.deepEqual(repair.production(context.request, context.invocation), parentProduction)
          const nextCommits = new RunnerRepairCommits(next),
            pinned = await nextCommits.execute(context)
          assert.equal(pinned.status, 'committed', JSON.stringify(pinned))
          if (!('receipt' in pinned)) throw new Error('Second correction commit required')
          assert.equal(pinned.receipt.parent, committed.receipt.head)
          assert.notEqual(pinned.receipt.head, committed.receipt.head)
          assert.equal(pinned.qa, 'pending')
          assert.deepEqual(
            new RunnerGitStages(store).candidate(context.request, 'search', nextCommits).receipt,
            pinned.receipt,
          )
          assert.throws(
            () => new RunnerGitStages(store).candidate(context.request, 'search', commits),
            /original-correction-head-binding-required/,
          )
          assert.equal(
            parent.historical(context.request, context.invocation, committed.receipt.digest).receipt
              .digest,
            committed.receipt.digest,
          )
          store.lifecycle.transition(context.request.run, {
            to: 'paused',
            reason: 'Inspect only the exact later correction commit and original parent.',
          })
          next.options.context = () => {
            throw new Error('Later correction recovery cannot select inputs')
          }
          next.options.boundary = () => {
            throw new Error('Later correction recovery cannot construct a host')
          }
          const freshNext = RunnerRepairWorkers.after(
              new RunnerRepairCommits(repair),
              context.request,
              context.invocation,
              committed.receipt.digest,
            ),
            restored = await new RunnerRepairCommits(freshNext).inspect(
              context.request,
              context.invocation,
            )
          assert.equal(restored.status, 'committed', JSON.stringify(restored))
          if (!('receipt' in restored))
            throw new Error('Retained later correction receipt required')
          assert.deepEqual(restored.receipt, pinned.receipt)
          assert.equal((await freshNext.execute(recovered, context)).status, 'blocked')
          assert.equal(scope.calls().length, calls + 1)
          assert.equal(
            findBudget(store.lifecycle.journal.get(context.request.run))?.failures.length,
            2,
          )
          assert.equal(store.budgets.inspect(context.request.run).deadline, before?.deadline)
          if (repeatVerification) {
            // The original reservation permits two live environments. Preserve its
            // evidence but release the oldest resources before preparing another.
            const retiredOriginal = await new EnvironmentLifecycle(store.files, driver).execute({
              schema: 'wholeloop/environment-lifecycle-request@1',
              id: `verify-continuation-${selection.environment}`,
              environment: selection.environment,
              expected: resources.get(selection.environment).digest,
              action: 'retire',
              reason: 'Release the exact oldest environment under the original capacity limit.',
            })
            assert.equal(retiredOriginal.state, 'retired', JSON.stringify(retiredOriginal))
            retiredEnvironments.add(selection.environment)
            store.lifecycle.transition(context.request.run, {
              to: 'queued',
              reason: 'Verify the exact second correction under the original route.',
            })
            const thirdEnvironment = await environments.provision({
              schema: 'wholeloop/environment-provision-request@1',
              run: context.request.run,
              recipe: firstEnvironment.recipe,
              key: 'verification-third-round',
              helperImage: firstEnvironment.helperImage,
              workspaces: [
                {
                  repository: 'app',
                  path: initial.repository,
                  head: pinned.receipt.head,
                  snapshot: workspaceSnapshot(initial.repository).digest,
                },
              ],
            })
            assert.equal(thirdEnvironment.status, 'ready', JSON.stringify(thirdEnvironment))
            assert.ok(thirdEnvironment.environment)
            const thirdId = thirdEnvironment.environment.record.id
            extraEnvironments.push(thirdId)
            store.lifecycle.transition(context.request.run, {
              to: 'queued',
              reason: 'Continue the same gate after third-environment readiness.',
            })
            const third = new RunnerVerificationStages(store, {
                ...original.options,
                correction: nextCommits,
                suite: () => ({ ...selection, environment: thirdId }),
              }),
              observedThird = await third.advance(context)
            assert.equal(observedThird.status, 'passed', JSON.stringify(observedThird))
            assert.equal(observedThird.provenance, 'host-observed')
            const last = gateRuns(engine.store.events()).find((run) => run.run === first.run)
            assert.equal(last?.rounds.length, 3)
            assert.equal(last?.budget, first.budget)
            assert.equal(last?.rounds[2]?.plan.snapshot.head, pinned.receipt.head)
            assert.equal(last?.rounds[2]?.decision?.report.verdict, 'PASS')
            const nativeCalls = scope.calls().length
            store.lifecycle.transition(context.request.run, {
              to: 'paused',
              reason: 'Recover only the exact third-round verification metadata.',
            })
            third.options.suite = () => {
              throw new Error('Third-round recovery cannot select another environment')
            }
            third.options.gate = () => {
              throw new Error('Third-round recovery cannot construct a host')
            }
            renameSync(pointer, `${pointer}.third-lost`)
            const thirdRecovered = await new RunnerVerificationStages(store, third.options).advance(
              context,
            )
            assert.deepEqual(thirdRecovered, observedThird)
            assert.equal(scope.calls().length, nativeCalls)
            assert.equal(
              gateRuns(engine.store.events()).find((run) => run.run === first.run)?.rounds.length,
              3,
            )
            assert.equal(store.budgets.inspect(context.request.run).deadline, before?.deadline)
            assert.equal(
              findBudget(store.lifecycle.journal.get(context.request.run))?.failures.length,
              2,
            )
            assert.equal(
              store.stage(contractDigest(context.request), context.stage.id)?.status,
              'running',
            )
            if (reviewAfterVerification) {
              store.lifecycle.transition(context.request.run, {
                to: 'queued',
                reason: 'Continue the next original stage after exact verification recovery.',
              })
              observe(observedThird)
              const reviewContext = dispatch('review:search'),
                reviewAbort = new AbortController(),
                reviewTimer = setTimeout(() => reviewAbort.abort(), 240000)
              reviewContext.signal = reviewAbort.signal
              reviewContext.deadline = new Date(
                Math.min(Date.parse(reviewContext.deadline), Date.now() + 240000),
              ).toISOString()
              try {
                const reader = new RunnerReviewStages(store, {
                    identity: context.request.host,
                    engine: original.options.engine,
                    gate: gateWorkerFixture(store, initial.repository, 'valid', 'host-observed'),
                    correction: nextCommits,
                  }),
                  reviewed = await reader.execute(reviewContext)
                assert.equal(reviewed.status, 'passed', JSON.stringify(reviewed))
                assert.equal(reviewed.provenance, 'host-observed')
                const reviewScope = new RunnerNativeScope(store.files, reviewContext.invocation),
                  reviewCalls = reviewScope.calls().length
                assert.ok(reviewCalls > 0)
                const readiness = unitReadiness ? new RunnerUnitReadiness(third, reader) : undefined
                let ready: RunnerUnitReadinessResult | undefined
                if (readiness) {
                  observe(reviewed)
                  ready = await readiness.inspect(context.request, 'search')
                  assert.equal(ready.status, 'ready', JSON.stringify(ready))
                  assert.equal(ready.provenance, 'host-observed')
                  assert.equal(ready.candidate?.commit, pinned.receipt.digest)
                  assert.equal(ready.candidate?.head, pinned.receipt.head)
                  const file = join(initial.repository, 'app.txt'),
                    bytes = readFileSync(file)
                  try {
                    writeFileSync(file, 'Changed after both stages passed.\n')
                    assert.equal(
                      (await readiness.inspect(context.request, 'search')).status,
                      'unknown',
                    )
                    assert.equal(
                      store.stage(contractDigest(context.request), context.stage.id)?.status,
                      'passed',
                    )
                    assert.equal(
                      store.stage(contractDigest(context.request), reviewContext.stage.id)?.status,
                      'passed',
                    )
                  } finally {
                    writeFileSync(file, bytes)
                  }
                  assert.deepEqual(await readiness.inspect(context.request, 'search'), ready)
                  checks.push(
                    'joint unit readiness reopens both observed gates at the same current corrected head and refuses changed bytes despite passing root-stage flags',
                  )
                }
                assert.equal(scope.calls().length, nativeCalls)
                assert.equal(
                  store.stage(contractDigest(context.request), context.stage.id)?.status,
                  'passed',
                )
                assert.equal(
                  new RunnerGitStages(store).candidate(context.request, 'search', nextCommits)
                    .receipt.digest,
                  pinned.receipt.digest,
                )
                store.lifecycle.transition(context.request.run, {
                  to: 'paused',
                  reason: 'Recover the original review of the verified corrected candidate.',
                })
                reader.options.gate = () => {
                  throw new Error('Recovery cannot launch a reviewer')
                }
                const reviewRecord = store.stage(
                  contractDigest(context.request),
                  reviewContext.stage.id,
                )
                assert.ok(reviewRecord)
                assert.deepEqual(
                  await new RunnerReviewStages(store, reader.options).inspect(
                    context.request,
                    reviewRecord,
                  ),
                  reviewed,
                )
                if (readiness) {
                  if (reopenCheckpoint) {
                    const journal = contractDigest(store.lifecycle.journal.events()),
                      fresh = new RunnerStore(store.files.root),
                      restoredRequest = fresh.get(contractDigest(context.request)),
                      deny = () => {
                        throw new Error('Checkpoint reconstruction cannot select or launch work')
                      },
                      factory = new RunnerRepairWorkers(
                        fresh,
                        new DeliveryQueue(fresh.files.root),
                        {
                          identity: restoredRequest.host,
                          get native() {
                            return deny()
                          },
                          context: deny,
                          boundary: deny,
                          admit: deny,
                        },
                      ),
                      reopened = RunnerRepairCommits.reopen(factory, restoredRequest, 'search'),
                      originalEngine = original.options.engine(context.request, initial.repository),
                      engine = () =>
                        new FlowEngine(
                          new StateStore(fresh.files.root),
                          originalEngine.root,
                          originalEngine.userFile,
                          originalEngine.home,
                        ),
                      verified = new RunnerVerificationStages(fresh, {
                        identity: restoredRequest.host,
                        engine,
                        correction: reopened,
                        suite: deny,
                        gate: deny,
                      }),
                      reviewed = new RunnerReviewStages(fresh, {
                        identity: restoredRequest.host,
                        engine,
                        correction: reopened,
                        gate: deny,
                      })
                    assert.equal(
                      reopened.workers.checkpointScope(context.invocation),
                      committed.receipt.digest,
                    )
                    assert.deepEqual(
                      await new RunnerUnitReadiness(verified, reviewed).inspect(
                        restoredRequest,
                        'search',
                      ),
                      ready,
                    )
                    const relative = `delivery/runner-repair-commits/${context.invocation}/after/${committed.receipt.digest}.json`,
                      locator = store.files.path(relative),
                      retained = `${locator}.catalog-retained`,
                      duplicate = store.files.path(
                        `delivery/runner-repair-commits/${context.invocation}/after/${'f'.repeat(64)}.json`,
                      )
                    assert.equal(existsSync(retained), false)
                    renameSync(locator, retained)
                    try {
                      symlinkSync(retained, locator)
                      assert.throws(
                        () => RunnerRepairCommits.reopen(factory, restoredRequest, 'search'),
                        /checkpoint-reopen-aliased-locator/,
                      )
                    } finally {
                      rmSync(locator, { force: true })
                      renameSync(retained, locator)
                    }
                    assert.equal(existsSync(duplicate), false)
                    try {
                      writeFileSync(duplicate, readFileSync(locator))
                      assert.throws(
                        () => RunnerRepairCommits.reopen(factory, restoredRequest, 'search'),
                        /checkpoint-reopen-exact-locator-required/,
                      )
                    } finally {
                      rmSync(duplicate, { force: true })
                    }
                    assert.equal(
                      new RunnerGitStages(fresh).candidate(
                        restoredRequest,
                        'search',
                        RunnerRepairCommits.reopen(factory, restoredRequest, 'search'),
                      ).receipt.digest,
                      pinned.receipt.digest,
                    )
                    assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
                    checks.push(
                      'fresh store/queue/factory instances reconstruct the exact predecessor chain from the journal-selected receipt and recover identical paused QA without selecting work',
                    )
                    checks.push(
                      'aliased or ambiguous checkpoint locators refuse without a newest-file fallback, mutation, replay or budget renewal; exact restoration remains inspectable',
                    )
                  }
                  assert.deepEqual(await readiness.inspect(context.request, 'search'), ready)
                  assert.equal(
                    findBudget(store.lifecycle.journal.get(context.request.run))?.failures.length,
                    2,
                  )
                  checks.push(
                    'paused joint readiness preserves exact original evidence and failure/deadline history without a selector, command, native call or feature acceptance',
                  )
                  if (predecessorReadiness) {
                    const downstream = new RunnerGitStages(store, new Map([['search', readiness]]))
                    store.lifecycle.transition(context.request.run, {
                      to: 'queued',
                      reason:
                        'Incorporate the exact QA-ready predecessor into its declared successor.',
                    })
                    const successor = dispatch('workspace:followup'),
                      file = join(initial.repository, 'app.txt'),
                      bytes = readFileSync(file),
                      before = contractDigest(store.lifecycle.journal.events())
                    try {
                      writeFileSync(file, 'Changed before downstream incorporation.\n')
                      await assert.rejects(
                        () => downstream.execute(successor),
                        /git-stage-predecessor-qa-not-current/,
                      )
                      assert.equal(contractDigest(store.lifecycle.journal.events()), before)
                    } finally {
                      writeFileSync(file, bytes)
                    }
                    const prepared = await downstream.execute(successor)
                    assert.equal(prepared.status, 'passed', JSON.stringify(prepared))
                    observe(prepared)
                    const allocation = downstream.workspace(context.request, 'followup')
                    assert.equal(allocation.parts.length, 1)
                    assert.equal(allocation.parts[0]?.head, pinned.receipt.head)
                    assert.deepEqual(
                      readFileSync(join(allocation.repository.path, 'app.txt')),
                      bytes,
                    )
                    store.lifecycle.transition(context.request.run, {
                      to: 'paused',
                      reason: 'Inspect the original downstream incorporation without replay.',
                    })
                    const record = store.stage(contractDigest(context.request), successor.stage.id)
                    assert.ok(record)
                    const journal = contractDigest(store.lifecycle.journal.events())
                    assert.equal(
                      (await new RunnerGitStages(store).inspect(context.request, record)).status,
                      'passed',
                    )
                    assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
                    checks.push(
                      'a declared downstream workspace refuses changed predecessor bytes, then incorporates the exact current QA-ready corrected commit and recovers while paused without replay',
                    )
                  }
                }
                assert.equal(reviewScope.calls().length, reviewCalls)
                assert.equal(scope.calls().length, nativeCalls)
                assert.equal(store.budgets.inspect(context.request.run).deadline, before?.deadline)
                checks.push(
                  'the next independent review consumes the exact verified correction through its original checkpoint without borrowing another stage continuation or replaying either scope',
                )
              } finally {
                clearTimeout(reviewTimer)
              }
            }
            checks.push(
              'two corrections reach a third original verification round with an actual passing unchanged suite and independent synthetic judgments',
            )
            checks.push(
              'third-round locator recovery retains all earlier rounds, original allowance/deadline and failure history without replay or root-stage completion',
            )
          }
          checks.push(
            'one later correction reuses the original builder slot at generation three and preserves exact original history without another deadline',
          )
          checks.push(
            'the distinct second commit follows its original predecessor, selects only its fully audited lineage and recovers while paused with QA pending and no worker replay',
          )
        } else {
          const reservations = store.budgets.inspect(context.request.run).reservations.length,
            admission = await admitRunnerRepair(recovered, context)
          assert.equal(admission.status, 'blocked', JSON.stringify(admission))
          if (admission.status !== 'blocked') throw new Error('Repeated failure must stop')
          assert.equal(admission.reason, 'repeated-repair-no-progress')
          assert.equal(store.lifecycle.journal.get(context.request.run).state, 'exhausted')
          assert.equal(
            runnerRepairStreak(
              store.lifecycle.journal.events(),
              context.request.run,
              'verification',
              feedback.fingerprint,
            ),
            2,
          )
          assert.equal(store.budgets.inspect(context.request.run).noProgress.streak, 1)
          assert.equal((await admitRunnerRepair(recovered, context)).status, 'blocked')
          assert.equal(
            findBudget(store.lifecycle.journal.get(context.request.run))?.failures.length,
            2,
          )
          assert.equal(store.budgets.inspect(context.request.run).reservations.length, reservations)
          assert.equal(scope.calls().length, calls)
          checks.push(
            'current corrected-head feedback retains its original failure fingerprint and exact second-round receipt',
          )
          checks.push(
            'the original two-failure limit exhausts the route across changed commit digests without another reservation, worker or duplicate failure',
          )
        }
      } else {
        checks.push(
          'the original failed verify run receives a fresh actual suite and independent synthetic judgments over the exact correction without renewing its allowance or narrower deadline',
        )
        checks.push(
          'lost planning response, verdict and active locator recover while paused without model, command or selector replay',
        )
        checks.push(
          'global failure/deadline history and root-stage completion remain separate from the observed gate verdict',
        )
      }
      if (process.argv.includes('--retire-success')) {
        for (const id of [selection.environment, environment, ...extraEnvironments]) {
          if (retiredEnvironments.has(id)) {
            assert.equal(resources.get(id).record.state, 'retired')
            continue
          }
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `verify-continuation-${id}`,
            environment: id,
            expected: resources.get(id).digest,
            action: 'retire',
            reason: 'Retire only the exact original continued-verification environment.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
        }
        checks.push(
          `${2 + extraEnvironments.length} exact observed environments retire without broad cleanup`,
        )
      }
    } finally {
      clearTimeout(timer)
    }
  },
  {
    backend: 'docker',
    production: true,
    unattended: true,
    repairSensitive: !repeated,
    secondRepairSensitive: repeatVerification,
    ...(repeated ? { exit: 7, noProgress: secondCorrection ? 3 : 2 } : {}),
    retain: true,
    ...(predecessorReadiness ? { successor: true } : {}),
  },
)
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nativeAcceptance: 'not-established',
  applicationHostAcceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
