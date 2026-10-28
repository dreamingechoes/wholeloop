import assert from 'node:assert/strict'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerEnvironmentFixture } from '../../support/runner-environment.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
await runnerEnvironmentFixture(
  async ({ store, scope, context, environment, operations, driver }) => {
    await scope.run(context, environment, driver, (selected) => selected.call(['info']))
    const original = scope.inspect(),
      phase = contractDigest({ run: 'original', round: 2 }),
      later = new RunnerEnvironmentScope(store, context.invocation, phase)
    await later.run(context, environment, driver, (selected) => selected.call(['info']))
    const observed = later.inspect()
    assert.equal(observed.invocationState, 'stopped')
    assert.notEqual(observed.reads[0]?.invocation, original.reads[0]?.invocation)
    assert.deepEqual(scope.inspect(), original)
    assert.deepEqual(
      new RunnerEnvironmentScope(
        new RunnerStore(store.files.root),
        context.invocation,
        phase,
      ).inspect(),
      observed,
    )
    await assert.rejects(
      () => later.run(context, environment, driver, async () => undefined),
      /environment-stage-original-unresolved/,
    )
    checks.push(
      'separate phase read owners preserve exact original metadata and refuse repeated dispatch',
    )
    const final = new RunnerEnvironmentScope(
        store,
        context.invocation,
        contractDigest({ run: 'original', round: 3 }),
      ),
      args = ['container', 'create', 'synthetic-phase'],
      effect = operations.begin(args, 5000)
    await final.run(context, environment, driver, async (selected) =>
      operations.close(effect, await selected.call(args, { registration: effect })),
    )
    const path = store.files.path(
      `delivery/runner-environments/${context.invocation}/${phase}.json`,
    )
    renameSync(path, `${path}.lost`)
    store.lifecycle.authority.revoke({
      schema: 'wholeloop/delivery-revocation-request@1',
      grant: context.request.grant,
      operator: 'Fixture Operator',
      reason: 'Preserve original cancellation without future execution authority.',
    })
    assert.throws(() => scope.cancelAll(), /environment-stage-cancellation-unresolved/)
    assert.equal(existsSync(effect.cancel), true)
    assert.equal(final.inspect().invocationState, 'stopped')
    checks.push(
      'revocation and one missing locator do not prevent cancellation of other exact private phase effects',
    )
    renameSync(`${path}.lost`, path)
    scope.cancelAll()
    assert.equal(scope.inspect().invocationState, 'stopped')
    assert.equal(later.inspect().invocationState, 'stopped')
    checks.push(
      'restored original phase metadata remains inspectable without new commands or an aggregate QA verdict',
    )
  },
)
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  applicationHostAcceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
