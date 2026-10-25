import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import evaluationSchema from '../../../src/integration/schemas/evaluation-v1.json' with {
  type: 'json',
}
import { entry, git } from '../../support/delivery.js'
import { integrationFixture } from '../../support/integration.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  schema: 'wholeloop/integration-evaluation@1',
  status: 'failed',
  controller: {
    os: process.platform,
    architecture: process.arch,
    node: process.version,
    git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
  },
  scope:
    'Actual disposable local Git and protected input observations only; combined application execution, native clients, accounts and publication are not certified.',
  retainedFixture: '',
  checks: [] as { id: string; evidence: string }[],
  reason: '',
}
function check(id: string, value: unknown) {
  report.checks.push({ id, evidence: contractDigest(value) })
  console.log(`Observed: ${id}`)
}
try {
  await integrationFixture(
    async ({ store, request, root, dir, paths }) => {
      report.retainedFixture = dir
      const main = git(root, ['rev-parse', 'HEAD']),
        first = store.prepare(request)
      assert.equal(first.candidate.assemblies.length, 2)
      assert.equal(first.candidate.acceptance, 'not-established')
      assert.equal(store.inspect(first.digest).status, 'current')
      check('actual-committed-two-repository-candidate', first)
      assert.equal(
        store.prepare({
          ...request,
          parts: [...request.parts].reverse(),
          inputs: [...request.inputs].reverse(),
        }).digest,
        first.digest,
      )
      check('normalized-complete-inputs-are-idempotent', store.compare(first.digest, first.digest))
      writeFileSync(join(paths.contract, 'contract.json'), 'dirty predecessor\n')
      assert.throws(() => store.prepare(request), /uncommitted-required-work/)
      writeFileSync(join(paths.contract, 'contract.json'), '{"version":"v1"}\n')
      assert.equal(store.inspect(first.digest).status, 'current')
      check('dirty-required-predecessor-is-not-silently-omitted', first.digest)
      const unknown = structuredClone(request)
      entry(unknown.contracts, 0).revision = 'unknown-version'
      assert.throws(() => store.prepare(unknown), /unknown-contract-revision/)
      check('unknown-contract-version-refuses-preparation', unknown.contracts)
      const data = request.inputs.find((input) => input.kind === 'data')
      if (!data) throw new Error('Missing data')
      const original = readFileSync(store.planning.sources.files.path(data.ref))
      store.planning.sources.files.atomic(data.ref, 'changed fixture bytes\n')
      assert.equal(store.inspect(first.digest).status, 'stale')
      store.planning.sources.files.atomic(data.ref, original.toString('utf8'))
      check('changed-protected-input-invalidates-candidate', data.id)
      writeFileSync(join(paths.search, 'search.txt'), 'A repaired committed part.\n')
      git(paths.search, ['add', '.'])
      git(paths.search, [
        'commit',
        '-m',
        'fix: repair an isolated candidate part',
        '-m',
        'Require a new candidate identity and retain the previous one.',
      ])
      const repaired = structuredClone(request),
        part = repaired.parts.find((part) => part.work === 'search'),
        assembly = repaired.assemblies.find((item) => item.repository === 'web')
      if (!part || !assembly) throw new Error('Missing web vector')
      part.head = git(paths.search, ['rev-parse', 'HEAD'])
      git(assembly.path, ['merge', '--ff-only', part.head])
      assembly.head = part.head
      const second = store.prepare(repaired)
      assert.notEqual(second.digest, first.digest)
      assert.equal(store.inspect(first.digest).status, 'stale')
      assert.equal(store.inspect(second.digest).status, 'current')
      assert.equal(store.compare(first.digest, second.digest).sameInputs, false)
      check(
        'new-committed-part-invalidates-old-vector-without-resetting-workers',
        store.compare(first.digest, second.digest),
      )
      assert.equal(git(root, ['rev-parse', 'HEAD']), main)
      assert.equal(git(paths.search, ['status', '--porcelain']), '')
      check('personal-target-and-worker-files-remain-preserved', { main, worker: part.head })
      writeFileSync(join(root, 'target-change.txt'), 'Moved target.\n')
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'feat: advance an isolated integration target',
        '-m',
        'Observe a blocked basis without a hidden refresh or rollback.',
      ])
      assert.throws(() => store.prepare(repaired), /target-base-advanced/)
      assert.equal(store.inspect(second.digest).status, 'stale')
      assert.equal(store.get(first.digest).digest, first.digest)
      check('moving-base-requires-a-new-authorized-basis', store.inspect(second.digest))
      report.status = 'passed'
    },
    { secondRepository: true, retain: true },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Integration evaluation failed'
  process.exitCode = 1
} finally {
  acceptanceShape(report, evaluationSchema)
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
