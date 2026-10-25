import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DockerAcceptanceBoundary } from '../../../src/acceptance/boundary.js'
import type { AcceptanceCase, AcceptancePlan } from '../../../src/acceptance/contracts.js'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import { DockerBehaviorHost } from '../../../src/acceptance/docker-behavior.js'
import { dockerSuiteExecutor } from '../../../src/acceptance/docker-suite.js'
import evaluationSchema from '../../../src/acceptance/schemas/behavior-evaluation-v1.json' with {
  type: 'json',
}
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { DockerCli, dockerJson } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import { runSuite } from '../../../src/verification/suite.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  schema: 'wholeloop/behavior-evaluation@1',
  status: 'failed',
  controller: { os: process.platform, architecture: process.arch, node: process.version },
  scope:
    'Actual model-free Docker API/CLI observations; independent Linux controller and native clients are not certified.',
  checks: [] as { id: string; evidence: string }[],
  environments: [] as { id: string; daemon: unknown }[],
  retainedFixture: '',
  retirement: 'not-requested',
  reason: '',
}
function check(id: string, value: unknown) {
  report.checks.push({ id, evidence: contractDigest(value) })
  console.log(`Observed: ${id}`)
}
function app(persistent: boolean) {
  return `const fs=require('node:fs'),http=require('node:http');
if(process.argv.includes('--unit-fail')){console.error('deliberate suite failure');process.exit(7)}
if(process.argv.includes('--unit')){console.log('unit suite passed');process.exit(0)}
if(process.argv.includes('--validate')){let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{if(!text.trim()){console.error('title required');process.exitCode=7}else console.log(JSON.stringify({count:0}))});return}
const file='/data/db/tasks.json';let tasks=[];
${persistent ? "try{tasks=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}" : ''}
http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
const url=new URL(req.url,'http://owned');res.setHeader('content-type','application/json');
if(req.method==='POST'){const title=JSON.parse(body).title;if(!title){res.statusCode=400;res.end(JSON.stringify({error:'title required'}));return}tasks.push({id:'task-1',title});${persistent ? 'fs.writeFileSync(file,JSON.stringify(tasks));' : ''}res.end(JSON.stringify({created:true}));return}
if(url.pathname==='/zero'){res.end(JSON.stringify({count:0}));return}
res.end(JSON.stringify({ids:tasks.filter(t=>t.title.includes(url.searchParams.get('title')||'')).map(t=>t.id)}))})}).listen(3000,'0.0.0.0');\n`
}
const api = (steps: unknown[]) =>
  JSON.stringify({
    schema: 'wholeloop/behavior-input@1',
    kind: 'api',
    service: 'web',
    port: 3000,
    steps,
  })
function caseDefinition(
  id: string,
  kind: 'api' | 'cli',
  input: string,
  assertions: AcceptanceCase['assertions'],
): AcceptanceCase {
  return {
    id,
    criteria: ['search'],
    owner: 'machine',
    applicability: 'applicable',
    rationale: 'Exercise agreed title search, durable storage and rejected input.',
    initial: 'A disposable task application owns its own data volume.',
    actions: ['Execute the pinned entrypoint and compare complete observed output.'],
    assertions,
    failureConditions: ['Any missing value or mismatch fails.'],
    runner: { kind, capability: kind === 'api' ? 'http.request' : 'process.exec', input },
    fixture: {
      ref: 'fixture:durable-task-search',
      sha256: contractDigest({ title: 'Durable task' }),
    },
    timeoutMs: 120000,
  }
}
try {
  await fixture(
    async ({ root, dir, planning, plan }) => {
      report.retainedFixture = dir
      writeFileSync(join(root, 'app.cjs'), app(false))
      const pkg = JSON.stringify({
        name: 'behavior-fixture',
        private: true,
        scripts: { check: 'node app.cjs --unit', test: 'node app.cjs --unit-fail' },
      })
      writeFileSync(join(root, 'package.json'), pkg)
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: seed a deliberately broken durable task fixture',
        '-m',
        'Show why passing unit tests alone cannot establish persistence.',
      ])
      entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
      const source = planning.sources.capture(
        {
          schema: 'wholeloop/delivery-source-request@1',
          kind: 'inline',
          ref: 'durable-search',
          body: 'Find tasks by title after a restart and reject empty titles. Preserve literal zero values.',
          mapping: [{ id: 'search', role: 'criterion', startLine: 1, endLine: 1 }],
        },
        root,
      )
      plan.source = source.id
      entry(plan.criteria, 0).text = source.body
      plan.budgets.wallTimeMs = 1800000
      plan.budgets.attemptMs = 180000
      const prepared = planning.preparePlan(plan)
      const acceptance = new DeliveryAcceptance(planning.sources.files.root)
      const environments = new DeliveryEnvironments(planning.sources.files.root)
      const grant = environments.effects.lifecycle.authority.authorize(
        authorization(plan, prepared.digest),
      )
      environments.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      environments.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Run authorized disposable behavior observations.',
      })
      const driver = new DockerCli()
      const daemon = dockerJson(await driver.call(['info', '--format', '{{json .}}'])) as {
        Architecture: string
      }
      const architecture = ['aarch64', 'arm64'].includes(daemon.Architecture) ? 'arm64' : 'amd64'
      const candidate = join(dir, 'candidate')
      git(root, ['worktree', 'add', '-b', 'wl/behavior-evaluation', candidate, 'HEAD'])
      const persistence = caseDefinition(
        'persistence',
        'api',
        api([
          {
            id: 'create',
            kind: 'request',
            method: 'POST',
            path: '/tasks',
            body: '{"title":"Durable task"}',
            headers: { 'content-type': 'application/json' },
          },
          { id: 'restart', kind: 'restart' },
          { id: 'find', kind: 'request', method: 'GET', path: '/tasks?title=Durable' },
        ]),
        [
          {
            id: 'ids',
            subject: 'json',
            operator: 'equals',
            path: '/ids',
            expected: '["task-1"]',
            description: 'The task survives a real container restart.',
          },
        ],
      )
      const negative = caseDefinition(
        'reject-empty',
        'cli',
        JSON.stringify({
          schema: 'wholeloop/behavior-input@1',
          kind: 'cli',
          service: 'web',
          command: 'validate',
          stdin: '',
        }),
        [
          {
            id: 'exit',
            subject: 'exit',
            operator: 'equals',
            expected: '7',
            description: 'Reject an empty title with the observed nonzero exit.',
          },
          {
            id: 'error',
            subject: 'stderr',
            operator: 'contains',
            expected: '"title required"',
            description: 'Explain the rejected title.',
          },
        ],
      )
      const suite = caseDefinition(
        'suite',
        'cli',
        JSON.stringify({
          schema: 'wholeloop/behavior-input@1',
          kind: 'cli',
          service: 'web',
          command: 'unit',
        }),
        [
          {
            id: 'exit',
            subject: 'exit',
            operator: 'equals',
            expected: '0',
            description: 'The declared unit command completes successfully.',
          },
        ],
      )
      const failedSuite = structuredClone(suite)
      failedSuite.id = 'failed-suite'
      failedSuite.runner.input = JSON.stringify({
        schema: 'wholeloop/behavior-input@1',
        kind: 'cli',
        service: 'web',
        command: 'unit-fail',
      })
      const zero = caseDefinition(
        'zero',
        'api',
        api([{ id: 'get', kind: 'request', method: 'GET', path: '/zero' }]),
        [
          {
            id: 'count',
            subject: 'json',
            operator: 'equals',
            path: '/count',
            expected: '0',
            description: 'Zero is an observed value.',
          },
        ],
      )
      const missing = structuredClone(zero)
      missing.id = 'missing'
      entry(missing.assertions, 0).path = '/missing'
      const wrongExit = structuredClone(negative)
      wrongExit.id = 'wrong-exit'
      entry(wrongExit.assertions, 0).expected = '0'
      const pinned = acceptance.prepare({
        schema: 'wholeloop/acceptance-plan@1',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        source: plan.source,
        cases: [persistence, negative, suite, zero, missing, wrongExit, failedSuite],
        retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
      } satisfies AcceptancePlan)
      async function provision(key: string, code: string) {
        writeFileSync(join(root, 'app.cjs'), code)
        writeFileSync(join(candidate, 'app.cjs'), code)
        const recipe = environmentRecipe(root, code, architecture)
        recipe.files.push({
          id: 'package',
          repository: 'app',
          ref: 'package.json',
          sha256: sourceHash(pkg),
          kind: 'package',
        })
        recipe.commands.push(
          {
            id: 'validate',
            service: 'web',
            phase: 'test',
            command: {
              argv: ['node', '/workspace/app/app.cjs', '--validate'],
              cwd: '/workspace/app',
              origin: { kind: 'file', file: 'server' },
            },
            timeoutMs: 30000,
          },
          {
            id: 'unit',
            service: 'web',
            phase: 'test',
            command: {
              argv: ['npm', 'run', 'check'],
              cwd: '/workspace/app',
              origin: { kind: 'package-script', file: 'package', script: 'check' },
            },
            timeoutMs: 30000,
          },
        )
        recipe.commands.push({
          id: 'unit-fail',
          service: 'web',
          phase: 'test',
          command: {
            argv: ['npm', 'run', 'test'],
            cwd: '/workspace/app',
            origin: { kind: 'package-script', file: 'package', script: 'test' },
          },
          timeoutMs: 30000,
        })
        const observed = workspaceSnapshot(candidate)
        const result = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: plan.run,
          recipe: environments.recipes.prepare(recipe).digest,
          key,
          helperImage: DOCKER_REFERENCE_HELPER,
          workspaces: [
            { repository: 'app', path: candidate, head: observed.head, snapshot: observed.digest },
          ],
        })
        assert.equal(result.status, 'ready', JSON.stringify(result))
        assert.ok(result.environment)
        report.environments.push({
          id: result.environment.record.id,
          daemon: result.environment.record.daemon,
        })
        environments.effects.lifecycle.transition(plan.run, {
          to: 'queued',
          reason: 'Observe behavior in the exact provisioned environment.',
        })
        return result.environment.record.id
      }
      const first = await provision('broken', app(false))
      const boundary = (environment: string) =>
        new DockerAcceptanceBoundary(environments.resources, environment, driver)
      const execute = (environment: string, id: string, key: string) =>
        acceptance.executeCase(
          pinned.digest,
          id,
          key,
          boundary(environment),
          new DockerBehaviorHost(acceptance, pinned.digest, environment, id, driver),
        )
      const failed = await execute(first, 'persistence', 'broken')
      assert.equal(failed.status, 'failed', JSON.stringify(failed))
      check('actual-restart-exposes-memory-only-storage', failed)
      const badExit = await execute(first, 'wrong-exit', 'wrong')
      assert.equal(badExit.status, 'failed', JSON.stringify(badExit))
      check('actual-wrong-exit-fails', badExit)
      const missingResult = await execute(first, 'missing', 'missing')
      assert.equal(missingResult.status, 'failed')
      check('missing-is-not-zero', missingResult)
      const engine = new FlowEngine(
        new StateStore(join(dir, 'gates')),
        candidate,
        join(dir, 'config.yml'),
        join(dir, 'home'),
      )
      const gates = new GateWorkflow(engine)
      const item = engine.store.create({
        kind: 'review',
        title: 'Verify durable task search',
        owner: 'Fixture Owner',
        body: 'Disposable acceptance evaluation.',
        repository: candidate,
      })
      const begun = {
        subject: item.id,
        plan: gates.plan(item.id, 'verify', {
          base: 'main',
          criteria: [
            {
              id: 'search',
              text: source.body,
              test: 'Find the created title after restarting the application.',
            },
          ],
        }).plan,
      }
      const gate = begun.plan
      const executor = dockerSuiteExecutor(
        acceptance,
        pinned.digest,
        first,
        { run: gate.run, round: gate.round },
        { 'package.json#check': 'suite' },
        driver,
      )
      const suiteResult = await runSuite(engine, begun.subject ?? '', gate.run, gate.round, {
        refs: ['package.json#check'],
        timeoutMs: 120000,
        executor,
      })
      assert.equal(suiteResult.result.status, 'passed', JSON.stringify(suiteResult))
      const repeated = await runSuite(engine, begun.subject ?? '', gate.run, gate.round, {
        refs: ['package.json#check'],
        timeoutMs: 120000,
        executor: async () => {
          throw new Error('A cached round must never dispatch again')
        },
      })
      assert.equal(repeated.cached, true)
      check('green-unit-suite-cannot-hide-failed-persistence', { suiteResult, failed, repeated })
      const second = await provision('repaired', app(true))
      const stale = await acceptance.report(pinned.digest, boundary(second))
      assert.notEqual(stale.status, 'passed')
      check('candidate-repair-invalidates-old-evidence', stale)
      const repaired = await execute(second, 'persistence', 'repaired')
      assert.equal(repaired.status, 'passed', JSON.stringify(repaired))
      check('actual-repair-persists-across-restart', repaired)
      const rejected = await execute(second, 'reject-empty', 'negative')
      assert.equal(rejected.status, 'passed', JSON.stringify(rejected))
      assert.ok(rejected.process?.pid)
      check('actual-negative-cli-observes-process-and-exit-seven', rejected)
      const zeroResult = await execute(second, 'zero', 'zero')
      assert.equal(zeroResult.status, 'passed')
      check('actual-zero-is-preserved', zeroResult)
      const oldSuite = await runSuite(engine, begun.subject, gate.run, gate.round, {
        refs: ['package.json#check'],
        timeoutMs: 120000,
        executor: async () => {
          throw new Error('Never rerun the old round')
        },
      })
      assert.equal(oldSuite.current, false)
      const verdict = gates.verdict(begun.subject, 'verify')
      assert.notEqual(verdict.verdict, 'PASS')
      const next = gates.plan(begun.subject, 'verify').plan
      assert.equal(next.run, gate.run)
      assert.equal(next.round, 2)
      assert.equal(next.budget, gate.budget)
      const failureExecutor = dockerSuiteExecutor(
        acceptance,
        pinned.digest,
        second,
        { run: next.run, round: next.round },
        { 'package.json#test': 'failed-suite' },
        driver,
      )
      const suiteFailure = await runSuite(engine, begun.subject, next.run, next.round, {
        refs: ['package.json#test'],
        timeoutMs: 120000,
        executor: failureExecutor,
      })
      assert.equal(suiteFailure.result.status, 'failed')
      assert.equal(suiteFailure.result.commands[0]?.exitCode, 7)
      const cachedFailure = await runSuite(engine, begun.subject, next.run, next.round, {
        executor: async () => {
          throw new Error('A failed suite is cached too')
        },
      })
      assert.equal(cachedFailure.cached, true)
      assert.equal(cachedFailure.result.status, 'failed')
      assert.equal(
        gateRuns(engine.store.events()).find((r) => r.run === gate.run)?.rounds.length,
        2,
      )
      check('repair-keeps-gate-policy-and-failed-suite-cache', {
        oldSuite,
        next,
        suiteFailure,
        cachedFailure,
      })
      if (process.argv.includes('--retire-success')) {
        for (const id of [first, second]) {
          const retired = await new EnvironmentLifecycle(
            environments.recipes.files,
            driver,
          ).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: 'behavior-evaluation-retire',
            environment: id,
            expected: environments.resources.get(id).digest,
            action: 'retire',
            reason:
              'Explicitly retire this exact disposable behavior fixture after retaining observations.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
        }
        report.retirement = 'observed-retired'
      }
      report.status = 'passed'
    },
    { retain: true },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Evaluation failed'
  process.exitCode = 1
} finally {
  acceptanceShape(report, evaluationSchema)
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
