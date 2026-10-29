import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { RunnerAcceptanceStages } from '../../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { StateStore } from '../../../src/state/store.js'

const root = process.argv[2]
assert.ok(root)
const store = new RunnerStore(root),
  directory = join(root, 'delivery/runner-integrations'),
  invocation = readdirSync(directory)[0]
assert.ok(invocation)
const binding = JSON.parse(readFileSync(join(directory, invocation, 'binding.json'), 'utf8')),
  request = store.get(binding.request),
  plan = store.basis(request).plan,
  repository = plan.repositories[0]
assert.ok(repository)
const engine = new FlowEngine(
    new StateStore(root),
    new RunnerGitStages(store).candidate(request, 'search').allocation.repository.path,
    store.files.path('fixture-config.yml'),
    store.files.path('fixture-home'),
  ),
  deny = () => {
    throw new Error('Metadata recovery cannot select execution')
  },
  verification = new RunnerVerificationStages(store, {
    identity: request.host,
    engine: () => engine,
    driver: { provenance: 'host-observed', call: deny },
    suite: deny,
    gate: deny,
  }),
  review = new RunnerReviewStages(store, {
    identity: request.host,
    engine: () => engine,
    gate: deny,
  }),
  readiness = new RunnerAssemblyReadiness(
    store,
    new RunnerMilestoneReadiness(
      store,
      new Map([['search', new RunnerUnitReadiness(verification, review)]]),
    ),
  ),
  host = new RunnerIntegrationStages(store, readiness),
  record = store.stage(binding.request, binding.stage)
assert.ok(record)
const before = contractDigest(store.lifecycle.journal.events()),
  feature = new RunnerFeatureReadiness(store, host),
  proof = await feature.inspect(request)
assert.equal(proof.status, 'ready', JSON.stringify(proof))
assert.equal(proof.acceptance, 'not-established')
assert.equal(proof.candidate, binding.selection.candidate)
assert.equal(proof.assembly, binding.selection.assembly)
assert.equal(contractDigest(store.lifecycle.journal.events()), before)
console.log(
  JSON.stringify({
    status: proof.status,
    evidence: proof.evidence,
    journal: 'unchanged',
    replay: 'not-performed',
    acceptance: proof.acceptance,
  }),
)
const path = join(directory, invocation, 'report.json'),
  bytes = readFileSync(path),
  original = host.inspect,
  backup = `${path}.feature-readiness-original`
if (existsSync(backup)) assert.deepEqual(readFileSync(backup), bytes)
else writeFileSync(backup, bytes, { flag: 'wx' })
try {
  host.inspect = async (...args) => {
    const observed = await original.apply(host, args)
    writeFileSync(path, JSON.stringify({ artifact: '0'.repeat(64) }))
    return observed
  }
  assert.equal((await feature.inspect(request)).status, 'unknown')
} finally {
  host.inspect = original
  writeFileSync(path, bytes)
}
assert.deepEqual(await feature.inspect(request), proof)
assert.equal(contractDigest(store.lifecycle.journal.events()), before)
console.log(
  JSON.stringify({
    postAwaitProductSubstitution: 'refused',
    restoration: 'identical',
    journal: 'unchanged',
    replay: 'not-performed',
  }),
)
const consumed = join(directory, invocation, 'consumed'),
  retained = `${consumed}.feature-readiness-original`
assert.equal(existsSync(retained), false)
try {
  host.inspect = async (...args) => {
    const observed = await original.apply(host, args)
    renameSync(consumed, retained)
    return observed
  }
  assert.equal((await feature.inspect(request)).status, 'unknown')
} finally {
  host.inspect = original
  if (existsSync(retained)) renameSync(retained, consumed)
}
assert.deepEqual(await feature.inspect(request), proof)
assert.equal(contractDigest(store.lifecycle.journal.events()), before)
console.log(
  JSON.stringify({
    postAwaitLostConsumption: 'refused',
    restoration: 'identical',
    journal: 'unchanged',
    replay: 'not-performed',
  }),
)

if (process.argv.includes('--acceptance')) {
  const stage = store.stage(binding.request, 'acceptance')
  assert.ok(stage)
  const adapter = new RunnerAcceptanceStages(store, feature, {
      identity: request.host,
      requests: deny,
      host: deny,
    }),
    observed = await adapter.inspect(request, stage)
  assert.equal(observed.status, stage.status, JSON.stringify(observed))
  assert.equal(observed.invocationState, 'stopped')
  assert.equal(observed.evidence, stage.evidence)
  const inspectProduct = feature.inspect.bind(feature)
  try {
    feature.inspect = async (...args) => ({
      ...(await inspectProduct(...args)),
      candidate: '0'.repeat(64),
    })
    assert.equal((await adapter.inspect(request, stage)).status, 'unknown')
  } finally {
    feature.inspect = inspectProduct
  }
  assert.deepEqual(await adapter.inspect(request, stage), observed)
  const path = store.files.path(`delivery/runner-acceptance/${stage.invocation}/binding.json`),
    retained = `${path}.metadata-original`
  assert.equal(existsSync(retained), false)
  try {
    renameSync(path, retained)
    assert.equal((await adapter.inspect(request, stage)).status, 'unknown')
  } finally {
    if (existsSync(retained)) renameSync(retained, path)
  }
  assert.deepEqual(await adapter.inspect(request, stage), observed)
  assert.equal(contractDigest(store.lifecycle.journal.events()), before)
  console.log(
    JSON.stringify({
      acceptance: observed.status,
      evidence: observed.evidence,
      freshController: 'observed',
      lostInput: 'refused',
      sameEvidenceForeignCandidate: 'refused',
      restoration: 'identical',
      journal: 'unchanged',
      replay: 'not-performed',
    }),
  )
}
