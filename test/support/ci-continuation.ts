import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { contractDigest } from '../../src/contracts/compatibility.js'
import { deliveryEffects, type EffectRecord } from '../../src/delivery/effect-events.js'
import { readSourceFile } from '../../src/delivery/input.js'
import { EnvironmentResources } from '../../src/environment/runtime.js'
import {
  ciCorrectionAdmitted,
  RunnerCiCorrectionAdmission,
} from '../../src/runner/ci-correction-admission.js'
import { ciCorrectionOrigin } from '../../src/runner/ci-correction-origin.js'
import { originalCiFailure } from '../../src/runner/ci-failure.js'
import { validateCiObservation } from '../../src/runner/ci-observations.js'
import { ciPublishedTarget } from '../../src/runner/ci-publication.js'
import { correctionProduction } from '../../src/runner/correction-production.js'
import type { CiResult } from '../../src/runner/merge-stages.js'
import { publicationRecords } from '../../src/runner/publication-evidence.js'
import type { PublicationBinding, RunnerCodeHost } from '../../src/runner/publication-stages.js'
import type { RunnerStore } from '../../src/runner/store.js'

/**
 * Verify the same retained SDK trial through fresh API and bare-object reads.
 * The synthetic server's JSON cache is not its API's current head: Git pushes
 * update the bare repository and the API projects that head on every read.
 * This verifier never reopens a run or grants current eligibility after retirement.
 */
export async function verifyCiContinuation(input: {
  store: RunnerStore
  first: string
  second: string
  bare: string
  host: RunnerCodeHost
}) {
  const { store, first, second, bare, host } = input,
    request = store.get(second),
    record = store.record(second),
    state = store.lifecycle.journal.get(request.run),
    before = contractDigest(store.lifecycle.journal.events()),
    plan = store.basis(request).plan
  assert.equal(state.state, 'blocked')
  assert.equal(state.outcome, 'blocked')
  for (const id of [
    'plan',
    'ci-correction-admission',
    'acceptance-definition',
    'workspace:search',
    'build-plan:search',
    'implementation:search',
    'commit:search',
    'correction-1:search',
    'verification:search',
    'review:search',
    'reverification:search',
    'integration:feature',
    'acceptance',
    'publication',
    'ci',
  ])
    assert.equal(record.stages.find((stage) => stage.id === id)?.status, 'passed', id)
  assert.equal(record.stages.find((stage) => stage.id === 'merge')?.status, 'blocked')
  assert.equal(
    store.lifecycle.authority.inspect(request.grant).grant.effects.includes('pr.merge'),
    false,
  )
  const failed = store.stage(first, 'ci'),
    publication = store.stage(second, 'publication'),
    ci = store.stage(second, 'ci'),
    correction = store.stage(second, 'correction-1:search'),
    workspace = store.stage(second, 'workspace:search'),
    admission = store.stage(second, 'ci-correction-admission')
  assert.ok(failed?.evidence && publication && ci && correction && workspace && admission)
  const original = originalCiFailure(store, {
      request: first,
      failure: failed.evidence,
      repository: 'app',
    }),
    origin = ciCorrectionOrigin(store, plan)
  assert.equal(origin?.proof.failure, original.failure)
  ciCorrectionAdmitted(store, request)
  assert.equal(
    new RunnerCiCorrectionAdmission(store, { identity: request.host, host }).inspect(
      request,
      admission,
    ).status,
    'passed',
  )
  const allocation = JSON.parse(
      readSourceFile(store.files.root, `delivery/runner-git/${workspace.invocation}.json`),
    ),
    production = correctionProduction(store, request, correction, allocation.resource)
  assert.equal(production.allocation.seed?.head, original.target.head)
  const base = `delivery/runner-publications/${publication.invocation}`,
    binding = JSON.parse(
      readSourceFile(store.files.root, `${base}/binding.json`),
    ) as PublicationBinding
  assert.equal(readSourceFile(store.files.root, `${base}/consumed`).trim(), contractDigest(binding))
  assert.equal(binding.request, second)
  assert.equal(binding.plan, request.plan)
  assert.equal(binding.ready, true)
  assert.equal(binding.targets.length, 1)
  const target = binding.targets[0]
  assert.ok(target)
  assert.equal(target.branch, original.target.branch)
  assert.equal(target.base, original.target.base)
  const effects = publicationRecords(store, request.run, binding)[0]
  assert.ok(effects)
  for (const [step, operation] of [
    ['push', 'git.push'],
    ['create', 'pr.create'],
    ['ready', 'pr.ready'],
  ] as const) {
    const effect: EffectRecord | undefined = effects[step]
    assert.equal(effect?.status, 'applied')
    assert.equal(effect?.intent.operation, operation)
    assert.equal(effect?.intent.ref, target.branch)
    assert.equal(effect?.intent.expectedHead, target.head)
    if (step !== 'push')
      assert.equal(effect?.observations.at(-1)?.resource?.revision, original.target.pr)
  }
  const listed = await host.pullRequests(target, new AbortController().signal),
    fresh = ciPublishedTarget(store, request.run, binding, target, listed)
  assert.ok(fresh)
  assert.equal(fresh.pr, original.target.pr)
  assert.equal(fresh.head, target.head)
  assert.equal(
    ciPublishedTarget(
      store,
      request.run,
      binding,
      target,
      listed.map((pr) => ({ ...pr, url: 'https://github.com/fixture/app/pull/999' })),
    ),
    undefined,
  )
  const git = (args: string[]) =>
    execFileSync('git', ['--git-dir', bare, ...args], { encoding: 'utf8' })
  assert.equal(git(['rev-parse', `refs/heads/${target.branch}`]).trim(), target.head)
  execFileSync('git', [
    '--git-dir',
    bare,
    'merge-base',
    '--is-ancestor',
    original.target.head,
    target.head,
  ])
  assert.equal(git(['show', `${original.target.head}:ci-status.txt`]), 'failed')
  assert.equal(git(['show', `${target.head}:ci-status.txt`]), 'passed')
  const status = git(['show', `${target.head}:status.txt`])
  assert.equal(status, 'public fixture')
  const result = JSON.parse(
      readSourceFile(store.files.root, `delivery/runner-ci-stages/${ci.invocation}/result.json`),
    ) as CiResult,
    observationId = result.targets[0]?.observations.at(-1)
  assert.ok(observationId)
  const observation = JSON.parse(
    readSourceFile(store.files.root, `delivery/runner-ci/${request.run}/${observationId}.json`),
  )
  validateCiObservation(observation)
  assert.equal(contractDigest(observation), observationId)
  assert.equal(observation.candidate, target.head)
  assert.equal(observation.pr, original.target.pr)
  assert.equal(observation.checks[0]?.conclusion, 'success')
  assert.equal(
    deliveryEffects(state).records.filter(
      (value) => value.intent.operation === 'git.push' && value.invocation,
    ).length,
    2,
  )
  assert.equal(
    deliveryEffects(state).records.some((value) => value.intent.operation === 'pr.merge'),
    false,
  )
  assert.equal(contractDigest(store.lifecycle.journal.events()), before)
  return {
    status: 'passed' as const,
    scope:
      'Synthetic native/API/CI/protection, actual Git and Docker history; no native model, containment or hosted acceptance.',
    firstHead: original.target.head,
    head: target.head,
    pr: original.target.pr,
    application: status,
    ciFile: 'passed' as const,
    merge: 'blocked-without-grant' as const,
    issuedPushes: 2,
    production: production.receipt.digest,
    environments: new EnvironmentResources(store.files)
      .list()
      .filter((value) => value.record.run === request.run)
      .map((value) => ({ id: value.record.id, state: value.record.state })),
  }
}
