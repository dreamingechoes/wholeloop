import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { observedDockerAcceptanceCase } from '../../../src/acceptance/case-observation.js'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { IntegrationAssembly } from '../../../src/integration/assembly.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
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
    store.lifecycle.transition(request.run, {
      to: 'paused',
      reason: 'Inspect original assembly readiness without replay.',
    })
    const journal = contractDigest(store.lifecycle.journal.events()),
      reopened = new RunnerAssemblyReadiness(new RunnerStore(store.files.root), units)
    assert.deepEqual(await reopened.inspect(request, 'feature', resource), observed)
    assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
    assert.equal(store.stage(digest, integration.stage.id)?.status, 'running')
    assert.equal(
      assembly.effects
        .inspect(request.run)
        .filter((effect) => effect.intent.key.startsWith(`assembly-${resource.slice(0, 24)}-`))
        .length,
      2,
    )
    checks.push(
      'paused fresh assembly inspection selects no model, command or Git operation, preserves the journal and leaves root integration/whole-product QA pending',
    )
    if (process.argv.includes('--retire-success')) {
      const resources = new EnvironmentResources(store.files),
        result = await new EnvironmentLifecycle(store.files, driver).execute({
          schema: 'wholeloop/environment-lifecycle-request@1',
          id: `assembly-ready-${selection.environment}`,
          environment: selection.environment,
          expected: resources.get(selection.environment).digest,
          action: 'retire',
          reason: 'Retire only the exact original assembly-readiness fixture environment.',
        })
      assert.equal(result.state, 'retired', JSON.stringify(result))
      checks.push('the exact original application environment retires without broad cleanup')
    }
  },
  { backend: 'docker', production: true, unattended: true, exit: 0, retain: true },
)
const report = {
  status: 'passed',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nativeAcceptance: 'not-established',
  integrationQa: 'not-established',
  acceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
