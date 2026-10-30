import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { observedDockerAcceptanceCase } from '../../../src/acceptance/case-observation.js'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import {
  DeliveryEnvironments,
  type EnvironmentProvisionRequest,
} from '../../../src/environment/provision.js'
import { EnvironmentRecipes } from '../../../src/environment/recipe-store.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { IntegrationAssembly } from '../../../src/integration/assembly.js'
import { integrationScope } from '../../../src/integration/contracts.js'
import { IntegrationCandidates } from '../../../src/integration/store.js'
import { integrationVerificationKey } from '../../../src/integration/verification.js'
import { RunnerAcceptanceStages } from '../../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import {
  RunnerEnvironmentProducer,
  type RunnerEnvironmentProducerResult,
} from '../../../src/runner/environment-producer.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerHandoffStages } from '../../../src/runner/handoff-stages.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { withBrowserService } from '../../support/browser.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerAcceptanceOptions } from '../../support/runner-acceptance.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
const productQaFailure = process.argv.includes('--product-qa-failure'),
  acceptanceReject = process.argv.includes('--acceptance-reject'),
  producerResult = process.argv.includes('--producer-result'),
  provisionOwner = producerResult || process.argv.includes('--provision-owner'),
  fixedDispatcher = provisionOwner || process.argv.includes('--dispatcher'),
  localHandoff = fixedDispatcher || process.argv.includes('--handoff'),
  acceptanceStage = localHandoff || acceptanceReject || process.argv.includes('--acceptance'),
  productQaApi = process.argv.includes('--product-qa-api'),
  browserMismatch = process.argv.includes('--product-qa-browser-failure'),
  productQaBrowser = browserMismatch || process.argv.includes('--product-qa-browser'),
  privateRegression = process.argv.includes('--product-qa-private-unproven'),
  privateMismatch = process.argv.includes('--product-qa-private-failure'),
  productQaPrivate =
    privateRegression || privateMismatch || process.argv.includes('--product-qa-private'),
  productQa =
    productQaFailure ||
    productQaApi ||
    productQaPrivate ||
    productQaBrowser ||
    acceptanceStage ||
    process.argv.includes('--product-qa')
await runnerSuiteFixture(
  async ({ store, context, engine, selection, driver, dispatch, observe }) => {
    console.log(`Retained original store: ${store.files.root}`)
    const request = context.request,
      digest = contractDigest(request),
      candidate = new RunnerGitStages(store).candidate(request, 'search'),
      verifyAbort = new AbortController(),
      verifyTimer = setTimeout(() => verifyAbort.abort(), 120000)
    context.signal = verifyAbort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + 120000),
    ).toISOString()
    const verification = new RunnerVerificationStages(store, {
      identity: request.host,
      engine: () => engine,
      driver,
      suite: () => selection,
      gate: gateWorkerFixture(
        store,
        candidate.allocation.repository.path,
        'valid',
        'host-observed',
      ),
    })
    try {
      const result = await verification.execute(context)
      assert.equal(result.status, 'passed', JSON.stringify(result))
      observe(result)
    } finally {
      clearTimeout(verifyTimer)
    }
    console.log('Original actual suite and independent verification passed')
    const acceptance = new DeliveryAcceptance(store.files.root),
      cases = acceptance.observedResults(selection.acceptance, 'suite')
    assert.equal(cases.length, 1)
    const original = cases[0]
    assert.ok(original)
    const observedCase = () =>
        observedDockerAcceptanceCase(acceptance, selection.acceptance, 'suite', original.key),
      caseProof = observedCase(),
      casePath = store.files.path(
        `delivery/acceptance-cases/${selection.acceptance}/suite/${original.key}/result.json`,
      ),
      caseBytes = readFileSync(casePath),
      caseJournal = contractDigest(store.lifecycle.journal.events())
    assert.equal(caseProof.result.provenance, 'host-observed')
    assert.equal(caseProof.nativeOwnership, 'not-established')
    assert.equal(caseProof.currentAcceptance, 'not-established')
    try {
      writeFileSync(
        casePath,
        JSON.stringify({
          ...original,
          status: 'failed',
          assertions: original.assertions.map((assertion) => ({ ...assertion, status: 'failed' })),
        }),
      )
      assert.throws(observedCase, /original-docker-case-observation-mismatch/)
    } finally {
      writeFileSync(casePath, caseBytes)
    }
    assert.deepEqual(observedCase(), caseProof)
    assert.equal(contractDigest(store.lifecycle.journal.events()), caseJournal)
    checks.push(
      'exact original assertion/capture artifacts reopen through their recorded Docker effect; changed case claims refuse and restoration preserves proof without replay or native/current acceptance',
    )
    const reviewContext = dispatch('review:search'),
      reviewAbort = new AbortController(),
      reviewTimer = setTimeout(() => reviewAbort.abort(), 120000)
    reviewContext.signal = reviewAbort.signal
    reviewContext.deadline = new Date(
      Math.min(Date.parse(reviewContext.deadline), Date.now() + 120000),
    ).toISOString()
    const review = new RunnerReviewStages(store, {
      identity: request.host,
      engine: () => engine,
      gate: gateWorkerFixture(
        store,
        candidate.allocation.repository.path,
        'valid',
        'host-observed',
      ),
    })
    try {
      const result = await review.execute(reviewContext)
      assert.equal(result.status, 'passed', JSON.stringify(result))
      observe(result)
    } finally {
      clearTimeout(reviewTimer)
    }
    const deny = () => {
      throw new Error('Readiness cannot select execution')
    }
    verification.options.suite = deny
    verification.options.gate = deny
    review.options.gate = deny
    const units = new RunnerMilestoneReadiness(
        store,
        new Map([['search', new RunnerUnitReadiness(verification, review)]]),
      ),
      ready = await units.inspect(request, 'feature')
    assert.equal(ready.status, 'ready', JSON.stringify(ready))
    assert.ok(ready.parts)
    checks.push(
      'the complete original unit vector requires actual suite/verification and independent review, without promoting flags',
    )
    if (productQaBrowser || fixedDispatcher) {
      // Unit QA is already closed. Release its exact resources rather than
      // carrying completed services into the next original bounded stage.
      const resources = new EnvironmentResources(store.files),
        retired = await new EnvironmentLifecycle(store.files, driver).execute({
          schema: 'wholeloop/environment-lifecycle-request@1',
          id: `completed-unit-${selection.environment}`,
          environment: selection.environment,
          expected: resources.get(selection.environment).digest,
          action: 'retire',
          reason: 'Release the exact completed unit QA environment before bounded product QA.',
        })
      assert.equal(retired.state, 'retired', JSON.stringify(retired))
      assert.equal(retired.clients, 'stopped')
    }
    const integration = dispatch('integration:feature'),
      abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 120000)
    integration.signal = abort.signal
    integration.deadline = new Date(
      Math.min(Date.parse(integration.deadline), Date.now() + 120000),
    ).toISOString()
    let registered = false
    const assembly = new IntegrationAssembly(store.files.root, undefined, {
      deadline: integration.deadline,
      signal: integration.signal,
      current: integration.current,
      started: ({ operation, pid }) => {
        if (registered) return
        integration.started({
          backend: 'owned-assembly-git',
          instance: operation,
          worker: String(pid),
        })
        registered = true
      },
    })
    let resource: string
    try {
      resource = assembly.prepare({
        schema: 'wholeloop/integration-assembly-request@1',
        run: request.run,
        revision: request.revision,
        plan: request.plan,
        milestone: 'feature',
        key: `runner-${integration.invocation.slice(0, 25)}`,
        parts: ready.parts,
      }).digest
      const result = await assembly.execute(resource)
      assert.equal(result.status, 'assembled', JSON.stringify(result))
    } finally {
      clearTimeout(timer)
    }
    assert.equal(registered, true)
    console.log('The exact QA-ready vector is assembled through original owned Git effects')
    const reader = new RunnerAssemblyReadiness(store, units),
      observed = await reader.inspect(request, 'feature', resource)
    assert.equal(observed.status, 'ready', JSON.stringify(observed))
    assert.equal(observed.integrationQa, 'not-established')
    assert.equal(observed.acceptance, 'not-established')
    assert.equal(observed.candidates?.length, 1)
    const assembled = observed.candidates?.[0]
    assert.ok(assembled)
    const file = join(assembled.path, 'app.txt'),
      bytes = readFileSync(file)
    assert.deepEqual(bytes, readFileSync(join(candidate.allocation.repository.path, 'app.txt')))
    const checkAssemblyBytes = async () => {
      try {
        writeFileSync(file, 'Changed assembled bytes.\n')
        const refused = await reader.inspect(request, 'feature', resource)
        assert.equal(refused.status, 'blocked', JSON.stringify(refused))
        assert.equal(refused.candidates, undefined)
      } finally {
        writeFileSync(file, bytes)
      }
      assert.deepEqual(await reader.inspect(request, 'feature', resource), observed)
      checks.push(
        'current original unit QA and closed owned assembly effects join at the exact vector; changed assembly bytes refuse and exact restoration recovers identical proof',
      )
    }
    // Keep adversarial readback controls outside the original live execution
    // window, as in the API/browser modes; every assertion still runs below.
    if (!productQaApi && !productQaPrivate && !productQaBrowser && !fixedDispatcher)
      await checkAssemblyBytes()
    const environments = [selection.environment]
    let originalPreparation:
      | { producer: RunnerEnvironmentProducer; result: RunnerEnvironmentProducerResult }
      | undefined
    let product:
      | {
          host: RunnerIntegrationStages
          proof: Awaited<ReturnType<RunnerIntegrationStages['inspect']>>
        }
      | undefined
    if (productQa) {
      const recipes = new EnvironmentRecipes(store.files.root),
        originalRecipe = recipes.get(
          new EnvironmentResources(store.files).get(selection.environment).record.recipe,
        ),
        recipe = structuredClone(originalRecipe.recipe)
      recipe.repositories = recipe.repositories.map((repository) => ({
        ...repository,
        root: assembled.path,
      }))
      if (productQaBrowser) {
        withBrowserService(recipe)
      }
      if (productQaFailure) {
        const command = recipe.commands.find((command) => command.id === 'suite')
        assert.ok(command)
        command.command = {
          argv: ['node', '/workspace/app/suite.cjs', '--root-fail'],
          cwd: '/workspace/app',
          origin: { kind: 'file', file: 'suite' },
        }
      }
      const preparedRecipe = recipes.prepare(recipe),
        asset = (id: string, body: string) => {
          const ref = `delivery/integration-inputs/runner-${id}.txt`
          store.files.atomic(ref, body)
          return { ref, sha256: sourceHash(body) }
        },
        data = asset('db', '[]\n'),
        verify = asset('verify', 'Original required verification policy.\n'),
        rubric = asset('review', 'Original independent review policy.\n'),
        integrated = new IntegrationCandidates(store.files.root).prepare({
          schema: 'wholeloop/integration-candidate-request@1',
          run: request.run,
          revision: request.revision,
          plan: request.plan,
          milestone: 'feature',
          strategy: 'ordered-merge',
          parts: ready.parts,
          assemblies: observed.candidates?.map((repository) => ({
            ...repository,
            base: context.plan.repositories.find(
              (declared) => declared.id === repository.repository,
            )?.base,
          })),
          contracts: integrationScope(context.plan, 'feature').contracts,
          inputs: [
            {
              id: 'acceptance',
              kind: 'acceptance',
              ref: selection.acceptance,
              sha256: selection.acceptance,
              after: ['recipe', 'db'],
            },
            {
              id: 'recipe',
              kind: 'recipe',
              ref: preparedRecipe.digest,
              sha256: preparedRecipe.digest,
              after: [],
            },
            { id: 'db', kind: 'data', ...data, after: [] },
            {
              id: 'app-verify',
              kind: 'gate-policy',
              repository: 'app',
              gate: 'verify',
              ...verify,
              after: ['recipe'],
            },
            {
              id: 'app-review',
              kind: 'gate-policy',
              repository: 'app',
              gate: 'review',
              ...rubric,
              after: ['recipe'],
            },
          ],
          repairOwners: [{ criterion: 'search', kind: 'integration', id: 'feature' }],
        }),
        provisionInput: EnvironmentProvisionRequest = {
          schema: 'wholeloop/environment-provision-request@1',
          run: request.run,
          recipe: preparedRecipe.digest,
          key: 'original-root-product-qa',
          helperImage: DOCKER_REFERENCE_HELPER,
          workspaces: integrated.candidate.assemblies.map(
            ({ repository, path, head, snapshot }) => ({ repository, path, head, snapshot }),
          ),
        },
        preparation = new RunnerEnvironmentScope(
          store,
          integration.invocation,
          contractDigest({ phase: 'original-product-preparation' }),
        ),
        producer = new RunnerEnvironmentProducer(store, preparation.phase ?? ''),
        produced = producerResult
          ? await producer.prepare(integration, provisionInput, driver)
          : undefined,
        provision = producerResult
          ? undefined
          : provisionOwner
            ? await preparation.provision(integration, provisionInput, driver)
            : await new DeliveryEnvironments(store.files.root, driver).provision(provisionInput)
      if (produced) {
        assert.equal(produced.status, 'recorded-ready', JSON.stringify(produced))
        assert.ok(produced.environment)
        originalPreparation = { producer, result: produced }
      } else assert.equal(provision?.status, 'ready', JSON.stringify(provision))
      const preparedEnvironment = produced?.environment
        ? new EnvironmentResources(store.files).snapshot(
            produced.environment.id,
            produced.environment.digest,
          )
        : provision?.environment
      assert.ok(preparedEnvironment)
      environments.push(preparedEnvironment.record.id)
      const checkPreparation = () => {
        const preparedOwners = preparation.inspect()
        assert.equal(preparedOwners.invocationState, 'stopped')
        assert.ok(preparedOwners.operations.length > 0)
        assert.ok(preparedOwners.reads.length > 0)
        assert.equal(preparation.origin()?.deadline, integration.deadline)
        assert.ok(preparedEnvironment.record.deadline <= integration.deadline)
        assert.deepEqual(
          new RunnerEnvironmentScope(
            new RunnerStore(store.files.root),
            integration.invocation,
            preparation.phase,
          ).inspect(),
          preparedOwners,
        )
        checks.push(
          'original product preparation owns actual preflight reads and every registered Docker operation before product QA without renewing the original root deadline',
        )
      }
      if (provisionOwner && !producerResult) checkPreparation()
      store.lifecycle.transition(request.run, {
        to: 'queued',
        reason: 'Continue original integration after owned product environment readiness.',
      })
      const host = new RunnerIntegrationStages(store, reader),
        productInput = {
          selection: {
            schema: 'wholeloop/integration-verification-request@1',
            candidate: integrated.digest,
            assembly: resource,
            environment: preparedEnvironment.record.id,
          },
          driver,
        } as const,
        proof = fixedDispatcher
          ? await new RunnerStageDispatcher(store, request.host, { integration: host }).execute(
              integration,
              productInput,
            )
          : await host.execute(integration, productInput.selection, driver)
      assert.equal(
        proof.status,
        privateRegression
          ? 'unknown'
          : productQaFailure || privateMismatch || browserMismatch
            ? 'failed'
            : 'passed',
        JSON.stringify(proof),
      )
      assert.equal(proof.invocationState, privateRegression ? 'unknown' : 'stopped')
      assert.equal(proof.provenance, privateRegression ? 'fixture' : 'host-observed')
      // Keep every owner assertion after actual QA for this mode, just as the
      // existing dispatcher mode defers adversarial reads until after execution.
      if (producerResult) checkPreparation()
      if (productQaBrowser) {
        const facts = acceptance.observedResults(selection.acceptance, 'browser-product'),
          fact = facts.at(-1)
        assert.ok(fact)
        assert.equal(facts.length, 1)
        assert.equal(fact.status, browserMismatch ? 'failed' : 'passed')
        assert.equal(fact.process?.code, 0)
        assert.ok(fact.artifacts.length > 1, 'The original screenshot capture is retained')
        const native = new RunnerEnvironmentScope(store, integration.invocation).inspect(),
          execs = native.operations.filter((entry) => entry?.operation.action === 'exec')
        assert.equal(execs.length, 1)
        assert.equal(execs[0]?.status, 'stopped')
        assert.equal(native.invocationState, 'stopped')
        checks.push(
          browserMismatch
            ? 'an actual missing browser objective fails root QA despite zero MCP client exit and a retained screenshot'
            : 'the original isolated Chromium journey and screenshot join the invocation-specific private stdio exec with closed original root owners',
        )
      }
      if (productQaPrivate) {
        const facts = acceptance.observedResults(selection.acceptance, 'private-product'),
          fact = facts.at(-1)
        assert.ok(fact)
        assert.equal(facts.length, 1)
        assert.equal(fact.status, privateMismatch ? 'failed' : 'passed')
        assert.equal(fact.process?.code, 0)
        assert.equal(
          new RunnerEnvironmentScope(store, integration.invocation).inspect().invocationState,
          'stopped',
        )
        if (privateMismatch) {
          assert.equal(acceptance.observedResults(selection.acceptance, 'suite').length, 1)
          const directory = `delivery/runner-integrations/${integration.invocation}`,
            locator = JSON.parse(
              readFileSync(store.files.path(`${directory}/report.json`), 'utf8'),
            ),
            report = JSON.parse(
              acceptance.artifacts.bytes(request.run, locator.artifact).toString('utf8'),
            ),
            suffix = report.cases.find((entry: { id: string }) => entry.id === 'suite'),
            binding = JSON.parse(
              readFileSync(store.files.path(`${directory}/binding.json`), 'utf8'),
            ),
            key = integrationVerificationKey(binding.selection, 'suite'),
            intent = `delivery/acceptance-cases/${selection.acceptance}/suite/${key}/intent.json`,
            record = store.stage(digest, integration.stage.id),
            journal = contractDigest(store.lifecycle.journal.events())
          assert.equal(report.status, 'failed')
          assert.equal(suffix?.status, 'unavailable')
          assert.deepEqual(suffix?.evidence, [])
          assert.ok(record)
          assert.equal(existsSync(store.files.path(intent)), false)
          try {
            store.files.atomic(
              intent,
              JSON.stringify({
                schema: 'wholeloop/acceptance-case-intent@1',
                plan: selection.acceptance,
                case: 'suite',
                key,
                sequence: 2,
                invocation: randomUUID(),
                bindings: report.bindings,
                at: binding.at,
                deadline: binding.deadline,
                host: { id: 'docker-behavior', version: '1', capability: 'process.exec' },
                provenance: 'host-observed',
              }),
            )
            assert.equal((await host.inspect(request, record)).status, 'unknown')
          } finally {
            renameSync(store.files.path(intent), store.files.path(`${intent}.observed-fault`))
          }
          assert.deepEqual(await host.inspect(request, record), proof)
          assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
          checks.push(
            'the failed original prefix borrows no earlier suite result and refuses an unowned unresolved later intent; moving the fault aside restores identical proof',
          )
        }
        checks.push(
          privateRegression
            ? 'a passing private evaluator with no relevant observed baseline cannot establish regression sensitivity or root acceptance'
            : privateMismatch
              ? 'an actual private objective failure remains a failed root verdict despite zero evaluator exit and green original unit QA'
              : 'the original private definition and sensitivity proof join the invocation-specific evaluator container and closed root native owners',
        )
      }
      console.log(`Original root product QA observed: ${proof.status}`)
      observe(proof)
      if (acceptanceStage) {
        const acceptanceContext = dispatch('acceptance')
        acceptanceContext.deadline = new Date(
          Math.min(Date.parse(acceptanceContext.deadline), Date.now() + 120000),
        ).toISOString()
        const acceptance = new RunnerAcceptanceStages(
            store,
            new RunnerFeatureReadiness(store, host),
            runnerAcceptanceOptions(store, request, acceptanceReject ? 'reject' : 'accept'),
          ),
          accepted = fixedDispatcher
            ? await new RunnerStageDispatcher(store, request.host, { acceptance }).execute(
                acceptanceContext,
              )
            : await acceptance.execute(acceptanceContext)
        assert.equal(
          accepted.status,
          acceptanceReject ? 'blocked' : 'passed',
          JSON.stringify(accepted),
        )
        assert.equal(accepted.invocationState, 'stopped')
        assert.equal(accepted.provenance, 'host-observed')
        assert.equal(accepted.decisions?.length, 1)
        observe(accepted)
        const calls = new RunnerNativeScope(store.files, acceptanceContext.invocation).inspect(),
          before = contractDigest(store.lifecycle.journal.events()),
          path = store.files.path(
            `delivery/runner-acceptance/${acceptanceContext.invocation}/binding.json`,
          ),
          retained = `${path}.observed-original`,
          record = store.stage(digest, acceptanceContext.stage.id)
        assert.ok(record)
        assert.ok(calls.length >= 2)
        assert.ok(calls.every((call) => call.observed.invocationState === 'stopped'))
        acceptance.options.requests = deny
        acceptance.options.host = deny
        assert.equal(existsSync(retained), false)
        try {
          renameSync(path, retained)
          assert.equal((await acceptance.inspect(request, record)).status, 'unknown')
        } finally {
          renameSync(retained, path)
        }
        assert.deepEqual(await acceptance.inspect(request, record), accepted)
        assert.deepEqual(
          new RunnerNativeScope(store.files, acceptanceContext.invocation).inspect(),
          calls,
        )
        assert.equal(contractDigest(store.lifecycle.journal.events()), before)
        checks.push(
          acceptanceReject
            ? 'complete original product QA remains unaccepted after an independent delegated rejection, with closed original native owners and no human prompt'
            : 'complete original product QA joins independent delegated acceptance under its original deadline without human approval or publication',
        )
        checks.push(
          'a lost consumed acceptance input remains unknown; exact restoration recovers identical original decisions and native owners without selecting judgment or changing the journal',
        )
        console.log(`Original feature acceptance observed: ${accepted.status}`)
        if (localHandoff) {
          const handoffContext = dispatch('handoff')
          handoffContext.deadline = new Date(
            Math.min(Date.parse(handoffContext.deadline), Date.now() + 120000),
          ).toISOString()
          const handoff = new RunnerHandoffStages(store, acceptance),
            delivered = fixedDispatcher
              ? await new RunnerStageDispatcher(store, request.host, { handoff }).execute(
                  handoffContext,
                )
              : await handoff.execute(handoffContext)
          assert.equal(delivered.status, 'passed', JSON.stringify(delivered))
          assert.equal(delivered.invocationState, 'stopped')
          assert.equal(delivered.provenance, 'host-observed')
          observe(delivered)
          const endpoint = await handoff.endpoint(
              request,
              context.plan,
              new AbortController().signal,
            ),
            before = contractDigest(store.lifecycle.journal.events()),
            record = store.stage(digest, 'handoff'),
            path = store.files.path(
              `delivery/runner-handoffs/${handoffContext.invocation}/binding.json`,
            ),
            retained = `${path}.observed-original`
          assert.ok(record)
          assert.equal(endpoint.current, true)
          assert.equal(endpoint.outcome, 'code-ready')
          assert.equal(endpoint.provenance, 'host-observed')
          assert.deepEqual(
            new RunnerNativeScope(store.files, handoffContext.invocation).calls(),
            [],
          )
          assert.equal(existsSync(retained), false)
          try {
            renameSync(path, retained)
            assert.equal((await handoff.inspect(request, record)).status, 'unknown')
            assert.equal(
              (await handoff.endpoint(request, context.plan, new AbortController().signal)).current,
              false,
            )
          } finally {
            renameSync(retained, path)
          }
          assert.deepEqual(await handoff.inspect(request, record), delivered)
          assert.deepEqual(
            await handoff.endpoint(request, context.plan, new AbortController().signal),
            endpoint,
          )
          const changed = join(assembled.path, 'app.cjs'),
            bytes = readFileSync(changed)
          store.files.atomic('fixture-handoff-original-app.cjs', bytes)
          try {
            writeFileSync(
              changed,
              Buffer.concat([
                bytes,
                Buffer.from('\n// Observe stale handoff proof without replay.\n'),
              ]),
            )
            assert.equal(
              (await handoff.endpoint(request, context.plan, new AbortController().signal)).current,
              false,
            )
          } finally {
            writeFileSync(changed, bytes)
          }
          assert.deepEqual(
            await handoff.endpoint(request, context.plan, new AbortController().signal),
            endpoint,
          )
          assert.equal(contractDigest(store.lifecycle.journal.events()), before)
          checks.push(
            'original accepted topics produce one bounded owned-core report and a current code-ready local endpoint without another native process or publication',
          )
          checks.push(
            'lost handoff locators and changed candidate bytes refuse local completion; exact restoration recovers identical endpoint proof and journal without replay',
          )
          console.log('Original local endpoint observed: code-ready')
        }
      }
      product = { host, proof }
      assert.deepEqual(
        await host.inspect(
          request,
          store.stage(digest, integration.stage.id) ??
            (() => {
              throw new Error('Original stage missing')
            })(),
        ),
        proof,
      )
      checks.push(
        'original root product QA executes the complete pinned machine coverage through owned Docker phases at the unchanged original deadline and records only its scoped integration result',
      )
      if (productQaApi || productQaPrivate || productQaBrowser) {
        const reportPath = store.files.path(
            `delivery/runner-integrations/${integration.invocation}/report.json`,
          ),
          reportBytes = readFileSync(reportPath),
          scopePath = store.files.path(
            `delivery/runner-environments/${integration.invocation}.json`,
          ),
          scopeBytes = readFileSync(scopePath),
          record = store.stage(digest, integration.stage.id),
          journal = contractDigest(store.lifecycle.journal.events())
        assert.ok(record)
        try {
          writeFileSync(reportPath, JSON.stringify({ artifact: '0'.repeat(64) }))
          assert.equal((await host.inspect(request, record)).status, 'unknown')
        } finally {
          writeFileSync(reportPath, reportBytes)
        }
        try {
          const changed = JSON.parse(scopeBytes.toString('utf8'))
          changed.deadline = new Date(Date.parse(changed.deadline) + 1000).toISOString()
          writeFileSync(scopePath, JSON.stringify(changed))
          assert.equal((await host.inspect(request, record)).status, 'unknown')
        } finally {
          writeFileSync(scopePath, scopeBytes)
        }
        assert.deepEqual(await host.inspect(request, record), proof)
        assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
        checks.push(
          'actual assembled HTTP and CLI evidence refuses substituted report locators and a renewed native-scope deadline; exact restoration recovers identical proof without journal mutation',
        )
      }
    }
    if (productQaApi || productQaPrivate || productQaBrowser || fixedDispatcher)
      await checkAssemblyBytes()
    store.lifecycle.transition(request.run, {
      to: 'paused',
      reason: 'Inspect original assembly readiness without replay.',
    })
    const journal = contractDigest(store.lifecycle.journal.events()),
      reopened = new RunnerAssemblyReadiness(new RunnerStore(store.files.root), units)
    if (originalPreparation) {
      const { producer, result } = originalPreparation,
        base = `delivery/runner-environment-results/${integration.invocation}/${producer.phase}`,
        locator = store.files.path(`${base}/result.json`),
        artifact = JSON.parse(readFileSync(locator, 'utf8')).artifact,
        originalOwner = new RunnerEnvironmentScope(
          store,
          integration.invocation,
          producer.phase,
        ).inspect().operations[0]
      assert.ok(originalOwner)
      assert.deepEqual(producer.inspect(integration.invocation), result)
      for (const [name, path] of [
        ['locator', locator],
        ['consumption', store.files.path(`${base}/consumed`)],
        ['artifact', store.files.path(`delivery/artifacts/${request.run}/${artifact}`)],
        [
          'native',
          store.files.path(
            `delivery/environment-operations/${result.environment?.id}/${originalOwner.operation.id}/outcome.json`,
          ),
        ],
      ] as const) {
        const backup = store.files.path(`${base}/${name}.original.retained`)
        try {
          renameSync(path, backup)
          if (name === 'native')
            assert.equal(
              new RunnerEnvironmentScope(store, integration.invocation, producer.phase).inspect()
                .invocationState,
              'stopped',
            )
          const lost = producer.inspect(integration.invocation)
          assert.equal(lost.status, 'unknown')
          assert.equal(lost.environment, undefined)
        } finally {
          renameSync(backup, path)
        }
        assert.deepEqual(producer.inspect(integration.invocation), result)
        assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
      }
      assert.deepEqual(
        new RunnerEnvironmentProducer(new RunnerStore(store.files.root), producer.phase).inspect(
          integration.invocation,
        ),
        result,
      )
      checks.push(
        'the budgeted original ready input survives paused fresh-controller recovery; lost locator, consumption, artifact and native outcome refuse despite stopped owners, and exact restoration preserves proof and journal without reprovisioning',
      )
    }
    assert.deepEqual(await reopened.inspect(request, 'feature', resource), observed)
    assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
    assert.equal(
      store.stage(digest, integration.stage.id)?.status,
      productQa
        ? privateRegression
          ? 'unknown'
          : productQaFailure || privateMismatch || browserMismatch
            ? 'failed'
            : 'passed'
        : 'running',
    )
    if (product) {
      const record = store.stage(digest, integration.stage.id)
      assert.ok(record)
      assert.deepEqual(await product.host.inspect(request, record), product.proof)
      assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
      checks.push(
        'paused original root integration recovery reopens actual product observations and native owners without replay, journal mutation or feature acceptance',
      )
    }
    assert.equal(
      assembly.effects
        .inspect(request.run)
        .filter((effect) => effect.intent.key.startsWith(`assembly-${resource.slice(0, 24)}-`))
        .length,
      2,
    )
    checks.push(
      acceptanceStage
        ? 'paused fresh assembly inspection selects no model, command or Git operation and preserves the independently observed acceptance result without publication'
        : productQa
          ? 'paused fresh assembly inspection selects no model, command or Git operation, preserves the journal and leaves feature acceptance pending'
          : 'paused fresh assembly inspection selects no model, command or Git operation, preserves the journal and leaves root integration/whole-product QA pending',
    )
    if (process.argv.includes('--retire-success')) {
      const resources = new EnvironmentResources(store.files)
      for (const environment of environments) {
        if (resources.get(environment).record.state === 'retired') continue
        const result = await new EnvironmentLifecycle(store.files, driver).execute({
          schema: 'wholeloop/environment-lifecycle-request@1',
          id: `assembly-ready-${environment}`,
          environment,
          expected: resources.get(environment).digest,
          action: 'retire',
          reason: 'Retire only the exact original assembly-readiness fixture environment.',
        })
        assert.equal(result.state, 'retired', JSON.stringify(result))
      }
      if (product) {
        const record = store.stage(digest, integration.stage.id)
        assert.ok(record)
        const before = contractDigest(store.lifecycle.journal.events())
        assert.deepEqual(await product.host.inspect(request, record), product.proof)
        assert.equal(contractDigest(store.lifecycle.journal.events()), before)
      }
      if (originalPreparation) {
        const before = contractDigest(store.lifecycle.journal.events())
        assert.deepEqual(
          originalPreparation.producer.inspect(integration.invocation),
          originalPreparation.result,
        )
        assert.equal(originalPreparation.result.readiness, 'historical-only')
        assert.equal(contractDigest(store.lifecycle.journal.events()), before)
        checks.push(
          'exact retirement preserves the recorded original prepared input while granting no live readiness or acceptance',
        )
      }
      checks.push('the exact original application environment retires without broad cleanup')
    }
  },
  {
    backend: 'docker',
    production: true,
    unattended: true,
    exit: 0,
    retain: true,
    productQa,
    productQaFailure,
    productQaApi,
    productQaPrivate,
    privateRegression,
    privateMismatch,
    productQaBrowser,
    browserMismatch,
    acceptanceStage,
  },
)
const report = {
  status: 'passed',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nativeAcceptance: 'not-established',
  integrationQa: productQa
    ? privateRegression
      ? 'not-established-private-sensitivity'
      : productQaFailure || privateMismatch || browserMismatch
        ? 'failed-original-fixture-only'
        : 'passed-original-fixture-only'
    : 'not-established',
  acceptance: acceptanceStage
    ? acceptanceReject
      ? 'rejected-original-fixture-only'
      : 'accepted-original-fixture-only'
    : 'not-established',
  publication: 'not-performed',
  localEndpoint: localHandoff ? 'code-ready-original-fixture-only' : 'not-established',
  stageDispatch: fixedDispatcher ? 'fixed-domain-adapters-original-fixture-only' : 'direct',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
