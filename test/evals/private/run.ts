import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DockerAcceptanceBoundary } from '../../../src/acceptance/boundary.js'
import type { AcceptanceCase, AcceptancePlan } from '../../../src/acceptance/contracts.js'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import { DockerPrivateHost } from '../../../src/acceptance/docker-private.js'
import type { PrivateAcceptancePlan } from '../../../src/acceptance/private-input.js'
import { PrivateAcceptance } from '../../../src/acceptance/private-plan.js'
import evaluationSchema from '../../../src/acceptance/schemas/private-evaluation-v1.json' with {
  type: 'json',
}
import { acceptanceSensitivity } from '../../../src/acceptance/sensitivity.js'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DockerCli, dockerJson } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  schema: 'wholeloop/private-evaluation@1',
  status: 'failed',
  controller: { os: process.platform, architecture: process.arch, node: process.version },
  scope:
    'Actual model-free Docker evaluator-only input and baseline/candidate observations. Same-user controller filesystems and native coding clients are not certified.',
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
function app(fixed: boolean, controllerFile: string) {
  return `const fs=require('node:fs'),http=require('node:http');let tasks=[];
if(process.argv.includes('--mutation')){console.log(JSON.stringify({schema:'wholeloop/mutation-counters@1',engine:'fixture-native-mutator',version:'1',complete:true,total:2,killed:1,survived:1,timedOut:0,uncovered:0,errors:0}));return}
http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{const url=new URL(req.url,'http://owned');res.setHeader('content-type','application/json');
if(url.pathname==='/boundary'){let readable=false,writable=false,controller=false;try{fs.readFileSync('/private/cases.json');readable=true}catch{}try{fs.writeFileSync('/private/cases.json','weakened');writable=true}catch{}try{fs.readFileSync(${JSON.stringify(controllerFile)});controller=true}catch{}res.end(JSON.stringify({readable,writable,controller}));return}
if(req.method==='POST'){const title=JSON.parse(body).title;${fixed ? "if(!title){res.statusCode=400;res.end(JSON.stringify({error:'title required'}));return}" : ''}tasks.push({id:'task-1',title});res.statusCode=201;res.end(JSON.stringify({created:true}));return}
res.end(JSON.stringify({ids:tasks.map(t=>t.id)}))})}).listen(80,'0.0.0.0');\n`
}
try {
  await fixture(
    async ({ root, dir, planning, plan }) => {
      report.retainedFixture = dir
      const controller = join(planning.sources.files.root, 'private-boundary-marker')
      writeFileSync(controller, 'private evaluator boundary marker\n')
      writeFileSync(join(root, 'app.cjs'), app(false, controller))
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: seed an empty-title regression baseline',
        '-m',
        'Prove that the same hidden case rejects the baseline and accepts its repair.',
      ])
      entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
      const source = planning.sources.capture(
        {
          schema: 'wholeloop/delivery-source-request@1',
          kind: 'inline',
          ref: 'private-empty-title',
          body: 'Reject an empty task title through the actual API. Keep acceptance inputs private from application workers.',
          mapping: [{ id: 'search', role: 'criterion', startLine: 1, endLine: 1 }],
        },
        root,
      )
      plan.source = source.id
      entry(plan.criteria, 0).text = source.body
      plan.budgets.wallTimeMs = 1800000
      plan.budgets.attemptMs = 180000
      const prepared = planning.preparePlan(plan),
        acceptance = new DeliveryAcceptance(planning.sources.files.root)
      const manifest: PrivateAcceptancePlan = {
        schema: 'wholeloop/private-acceptance@1',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        source: plan.source,
        case: 'empty-title',
        behavior: {
          schema: 'wholeloop/behavior-input@1',
          kind: 'api',
          service: 'web',
          port: 80,
          steps: [
            { id: 'boundary', kind: 'request', method: 'GET', path: '/boundary' },
            {
              id: 'empty',
              kind: 'request',
              method: 'POST',
              path: '/tasks',
              body: JSON.stringify({ title: '', note: '\u{1d11e}'.repeat(100000) }),
              headers: { 'content-type': 'application/json' },
            },
          ],
          targets: [
            { assertion: 'private-read', step: 'boundary' },
            { assertion: 'private-write', step: 'boundary' },
            { assertion: 'controller-read', step: 'boundary' },
            { assertion: 'reject-empty', step: 'empty' },
          ],
        },
        assertions: [
          {
            id: 'private-read',
            subject: 'json',
            operator: 'equals',
            path: '/readable',
            expected: 'false',
            description: 'Application cannot read the evaluator mount.',
          },
          {
            id: 'private-write',
            subject: 'json',
            operator: 'equals',
            path: '/writable',
            expected: 'false',
            description: 'Application cannot weaken evaluator case bytes.',
          },
          {
            id: 'controller-read',
            subject: 'json',
            operator: 'equals',
            path: '/controller',
            expected: 'false',
            description: 'Application cannot read the actual controller private file.',
          },
          {
            id: 'reject-empty',
            subject: 'status',
            operator: 'equals',
            expected: '400',
            description: 'Reject the empty title through the real API.',
          },
        ],
        sensitivity: { mode: 'regression', relevant: ['reject-empty'] },
      }
      const hidden = new PrivateAcceptance(acceptance).prepare(manifest)
      const optionalManifest = structuredClone(manifest)
      optionalManifest.case = 'new-feature'
      optionalManifest.sensitivity = {
        mode: 'new-feature',
        relevant: ['reject-empty'],
        mutation: { service: 'web', command: 'missing-mutations' },
      }
      const optional = new PrivateAcceptance(acceptance).prepare(optionalManifest)
      const mutationManifest = structuredClone(optionalManifest)
      mutationManifest.case = 'mutation-reported'
      mutationManifest.sensitivity = {
        mode: 'not-applicable',
        relevant: ['reject-empty'],
        mutation: { service: 'web', command: 'mutation' },
      }
      const mutationDefinition = new PrivateAcceptance(acceptance).prepare(mutationManifest)
      const unprovenManifest = structuredClone(manifest)
      unprovenManifest.case = 'unproven-regression'
      const unprovenDefinition = new PrivateAcceptance(acceptance).prepare(unprovenManifest)

      const test: AcceptanceCase = {
        id: 'empty-title',
        criteria: ['search'],
        owner: 'machine',
        applicability: 'applicable',
        rationale: 'The verifier owns the unchanged private regression standard.',
        initial: 'The owned task application is ready.',
        actions: ['Run the independent mounted private evaluator.'],
        assertions: [
          {
            id: 'private-outcome',
            subject: 'state',
            operator: 'equals',
            path: '/passed',
            expected: 'true',
            description: 'Every private objective assertion passes.',
          },
        ],
        failureConditions: ['Any actual relevant mismatch fails.'],
        runner: {
          kind: 'api',
          capability: 'evaluator.private-http',
          input: JSON.stringify({
            schema: 'wholeloop/private-case-input@1',
            manifest: hidden.digest,
          }),
        },
        fixture: { ref: 'fixture:private-empty-title', sha256: hidden.digest },
        timeoutMs: 120000,
      }
      const newFeature = structuredClone(test)
      newFeature.id = 'new-feature'
      newFeature.runner.input = JSON.stringify({
        schema: 'wholeloop/private-case-input@1',
        manifest: optional.digest,
      })
      newFeature.fixture.sha256 = optional.digest
      const mutationCase = structuredClone(newFeature)
      mutationCase.id = 'mutation-reported'
      mutationCase.runner.input = JSON.stringify({
        schema: 'wholeloop/private-case-input@1',
        manifest: mutationDefinition.digest,
      })
      mutationCase.fixture.sha256 = mutationDefinition.digest
      const unprovenCase = structuredClone(test)
      unprovenCase.id = 'unproven-regression'
      unprovenCase.runner.input = JSON.stringify({
        schema: 'wholeloop/private-case-input@1',
        manifest: unprovenDefinition.digest,
      })
      unprovenCase.fixture.sha256 = unprovenDefinition.digest
      const pinned = acceptance.prepare({
        schema: 'wholeloop/acceptance-plan@1',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        source: plan.source,
        cases: [test, newFeature, mutationCase, unprovenCase],
        retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
      } satisfies AcceptancePlan)
      const environments = new DeliveryEnvironments(planning.sources.files.root),
        grant = environments.effects.lifecycle.authority.authorize(
          authorization(plan, prepared.digest),
        )
      environments.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      environments.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Run exact disposable private evaluation.',
      })
      const driver = new DockerCli(),
        daemon = dockerJson(await driver.call(['info', '--format', '{{json .}}'])) as {
          Architecture: string
        }
      const architecture = ['arm64', 'aarch64'].includes(daemon.Architecture) ? 'arm64' : 'amd64',
        candidate = join(dir, 'candidate')
      git(root, ['worktree', 'add', '-b', 'wl/private-evaluation', candidate, 'HEAD'])
      async function provision(key: string, fixed: boolean) {
        const code = app(fixed, controller)
        writeFileSync(join(root, 'app.cjs'), code)
        writeFileSync(join(candidate, 'app.cjs'), code)
        const recipe = environmentRecipe(root, code, architecture),
          observed = workspaceSnapshot(candidate)
        recipe.commands.push({
          id: 'mutation',
          service: 'web',
          phase: 'test',
          command: {
            argv: ['node', '/workspace/app/app.cjs', '--mutation'],
            cwd: '/workspace/app',
            origin: { kind: 'file', file: 'server' },
          },
          timeoutMs: 30000,
        })
        entry(recipe.services, 0).ports = [{ container: 80, publish: 'loopback' }]
        entry(recipe.services, 0).readiness = { kind: 'tcp', port: 80, timeoutMs: 10000 }
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
          reason: 'Observe the private evaluator against the exact owned application.',
        })
        return result.environment.record.id
      }
      const boundary = (id: string) =>
        new DockerAcceptanceBoundary(environments.resources, id, driver)
      const execute = (id: string, key: string) =>
        acceptance.executeCase(
          pinned.digest,
          test.id,
          key,
          boundary(id),
          new DockerPrivateHost(acceptance, pinned.digest, id, test.id, driver),
        )
      const baseline = await provision('baseline', false),
        red = await execute(baseline, 'baseline')
      assert.equal(red.status, 'failed', JSON.stringify(red))
      assert.ok(red.process?.pid)
      const redArtifact = JSON.parse(
        Buffer.from(acceptance.artifacts.bytes(plan.run, entry(red.artifacts, 0))).toString('utf8'),
      )
      assert.equal(
        redArtifact.observation.private.assertions.find(
          (a: { id: string }) => a.id === 'reject-empty',
        ).status,
        'failed',
      )
      for (const id of ['private-read', 'private-write', 'controller-read'])
        assert.equal(
          redArtifact.observation.private.assertions.find((a: { id: string }) => a.id === id)
            .status,
          'passed',
        )
      check(
        'actual-application-cannot-read-or-weaken-private-evaluator-inputs',
        redArtifact.observation,
      )
      check('actual-unchanged-private-case-fails-on-baseline', red)
      const repaired = await provision('candidate', true),
        green = await execute(repaired, 'candidate')
      assert.equal(green.status, 'passed', JSON.stringify(green))
      check('actual-unchanged-private-case-passes-on-candidate', green)
      const greenArtifact = JSON.parse(
        Buffer.from(acceptance.artifacts.bytes(plan.run, entry(green.artifacts, 0))).toString(
          'utf8',
        ),
      )
      assert.equal(
        greenArtifact.observation.private.definition,
        redArtifact.observation.private.definition,
      )
      assert.equal(greenArtifact.observation.private.runner, redArtifact.observation.private.runner)
      check('same-definition-and-evaluator-identity-bind-red-green', {
        red: redArtifact.observation.private,
        green: greenArtifact.observation.private,
      })
      const sensitivity = await acceptanceSensitivity(acceptance, {
        schema: 'wholeloop/acceptance-sensitivity-request@1',
        plan: pinned.digest,
        case: test.id,
        baseline: { environment: baseline, key: 'baseline' },
        candidate: { environment: repaired, key: 'candidate' },
      })
      assert.equal(sensitivity.status, 'proven', JSON.stringify(sensitivity))
      assert.equal(sensitivity.semanticSensitivity, 'unknown')
      check('current-objective-regression-sensitivity-is-observed', sensitivity)
      const feature = await acceptance.executeCase(
        pinned.digest,
        newFeature.id,
        'candidate',
        boundary(repaired),
        new DockerPrivateHost(acceptance, pinned.digest, repaired, newFeature.id, driver),
      )
      assert.equal(feature.status, 'passed', JSON.stringify(feature))
      const featureSensitivity = await acceptanceSensitivity(acceptance, {
        schema: 'wholeloop/acceptance-sensitivity-request@1',
        plan: pinned.digest,
        case: newFeature.id,
        candidate: { environment: repaired, key: 'candidate' },
      })
      assert.equal(featureSensitivity.status, 'not-applicable', JSON.stringify(featureSensitivity))
      assert.equal(featureSensitivity.mutation.status, 'unavailable')
      assert.equal(featureSensitivity.semanticSensitivity, 'unknown')
      check(
        'missing-mutation-host-and-new-feature-absence-are-not-proven-sensitivity',
        featureSensitivity,
      )
      const mutationResult = await acceptance.executeCase(
        pinned.digest,
        mutationCase.id,
        'candidate',
        boundary(repaired),
        new DockerPrivateHost(acceptance, pinned.digest, repaired, mutationCase.id, driver),
      )
      assert.equal(mutationResult.status, 'passed', JSON.stringify(mutationResult))
      const counters = await acceptanceSensitivity(acceptance, {
        schema: 'wholeloop/acceptance-sensitivity-request@1',
        plan: pinned.digest,
        case: mutationCase.id,
        candidate: { environment: repaired, key: 'candidate' },
      })
      assert.equal(counters.status, 'not-applicable', JSON.stringify(counters))
      assert.equal(counters.mutation.status, 'observed')
      assert.equal(counters.semanticSensitivity, 'unknown')
      check('native-counter-fixture-is-observed-without-semantic-certification', counters)
      const candidateOnly = await acceptance.executeCase(
        pinned.digest,
        unprovenCase.id,
        'candidate',
        boundary(repaired),
        new DockerPrivateHost(acceptance, pinned.digest, repaired, unprovenCase.id, driver),
      )
      assert.equal(candidateOnly.status, 'passed', JSON.stringify(candidateOnly))
      const aggregate = await acceptance.report(pinned.digest, boundary(repaired))
      assert.equal(
        aggregate.cases.find((c) => c.id === test.id)?.status,
        'passed',
        JSON.stringify(aggregate),
      )
      assert.equal(
        aggregate.cases.find((c) => c.id === unprovenCase.id)?.status,
        'unavailable',
        JSON.stringify(aggregate),
      )
      assert.equal(aggregate.acceptance, 'not-established')
      const sealed = await acceptance.seal(pinned.digest, boundary(repaired))
      assert.equal(sealed.report.acceptance, 'not-established')
      check('candidate-only-pass-cannot-bypass-required-baseline-sensitivity', {
        aggregate,
        sealed,
      })
      writeFileSync(
        join(candidate, 'app.cjs'),
        `${app(true, controller)}// changed after acceptance\n`,
      )
      const stale = await acceptanceSensitivity(acceptance, {
        schema: 'wholeloop/acceptance-sensitivity-request@1',
        plan: pinned.digest,
        case: test.id,
        baseline: { environment: baseline, key: 'baseline' },
        candidate: { environment: repaired, key: 'candidate' },
      })
      assert.notEqual(stale.status, 'proven')
      check('candidate-edit-invalidates-current-sensitivity', stale)
      if (process.argv.includes('--retire-success')) {
        for (const id of [baseline, repaired]) {
          const receipt = await new EnvironmentLifecycle(
            environments.recipes.files,
            driver,
          ).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: 'private-evaluation-retire',
            environment: id,
            expected: environments.resources.get(id).digest,
            action: 'retire',
            reason:
              'Retire this exact disposable private-evaluation fixture after retaining proof.',
          })
          assert.equal(receipt.state, 'retired', JSON.stringify(receipt))
        }
        report.retirement = 'observed-retired'
      }
      report.status = 'passed'
    },
    { retain: true },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Private evaluation failed'
  process.exitCode = 1
} finally {
  acceptanceShape(report, evaluationSchema)
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
