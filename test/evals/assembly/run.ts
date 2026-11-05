import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type AcceptanceCase, acceptanceShape } from '../../../src/acceptance/contracts.js'
import { PrivateAcceptance } from '../../../src/acceptance/private-plan.js'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { DockerCli, dockerJson } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { EnvironmentRecipes } from '../../../src/environment/recipe-store.js'
import { IntegrationAssembly } from '../../../src/integration/assembly.js'
import type { IntegrationRequest } from '../../../src/integration/contracts.js'
import evaluationSchema from '../../../src/integration/schemas/assembly-evaluation-v1.json' with {
  type: 'json',
}
import { IntegrationCandidates } from '../../../src/integration/store.js'
import { IntegrationVerification } from '../../../src/integration/verification.js'
import { observedIntegrationVerification } from '../../../src/integration/verification-observation.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import {
  integrationCorrectionCases,
  RunnerIntegrationStages,
} from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  schema: 'wholeloop/assembly-evaluation@1',
  status: 'failed',
  controller: { os: process.platform, architecture: process.arch, node: process.version },
  scope:
    'Actual disposable two-repository Git assembly and Docker CLI/API observations; native clients, accounts, hosted publication and independent Linux controller certification are not established.',
  retainedFixture: '',
  checks: [] as { id: string; evidence: string }[],
  environments: [] as { id: string; daemon: unknown }[],
  retirement: 'not-requested',
  reason: '',
}
const check = (id: string, value: unknown) => {
  report.checks.push({ id, evidence: contractDigest(value) })
  console.log(`Observed: ${id}`)
}
const backend = (fixed: boolean) =>
  `const http=require('node:http'),assert=require('node:assert/strict');const payload={${fixed ? 'ids' : 'results'}:['task-1']};if(process.argv.includes('--unit')){assert.equal(Object.values(payload)[0][0],'task-1');console.log('backend unit passed');process.exit(0)}http.createServer((_q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify(payload))}).listen(3001,'0.0.0.0');\n`
// The private probe uses the existing web endpoint, keeping the backend port internal.
const frontend = `const http=require('node:http'),assert=require('node:assert/strict');const render=data=>{if(!Array.isArray(data.ids))throw Error('API contract mismatch');return {ids:data.ids}};if(process.argv.includes('--unit')){assert.deepEqual(render({ids:['task-1']}),{ids:['task-1']});console.log('frontend unit passed');process.exit(0)}http.createServer(async(_q,r)=>{r.setHeader('content-type','application/json');if(_q.url==='/private-status'){r.end(JSON.stringify({ready:true}));return}try{const data=await(await fetch('http://backend:3001/tasks')).json();r.end(JSON.stringify(render(data)))}catch{r.statusCode=502;r.end(JSON.stringify({error:'API contract mismatch'}))}}).listen(3000,'0.0.0.0');\n`
try {
  await fixture(
    async ({ planning, plan, root, dir }) => {
      report.retainedFixture = dir
      writeFileSync(join(root, 'app.cjs'), backend(false))
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: seed an incompatible backend fixture',
        '-m',
        'Expose why isolated unit success cannot establish combined behavior.',
      ])
      entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
      const webRoot = join(dir, 'frontend')
      mkdirSync(webRoot)
      git(webRoot, ['init', '-b', 'main'])
      git(webRoot, ['config', 'user.name', 'Fixture Owner'])
      git(webRoot, ['config', 'user.email', 'fixture@example.test'])
      writeFileSync(join(webRoot, 'app.cjs'), frontend)
      git(webRoot, ['add', '.'])
      git(webRoot, [
        'commit',
        '-m',
        'test: seed an independent frontend fixture',
        '-m',
        'Exercise the public backend contract through the combined application.',
      ])
      plan.repositories.push({
        id: 'web',
        root: webRoot,
        target: 'refs/heads/main',
        base: git(webRoot, ['rev-parse', 'HEAD']),
      })
      entry(plan.work, 1).repository = 'web'
      plan.budgets.wallTimeMs = 1800000
      plan.budgets.attemptMs = 180000
      const contractBody = '{"version":"v1","response":{"ids":["task-id"]}}\n',
        contract = entry(entry(plan.work, 0).produces, 0)
      contract.sha256 = sourceHash(contractBody)
      const prepared = planning.preparePlan(plan),
        assembly = new IntegrationAssembly(planning.sources.files.root),
        grantRequest = authorization(plan, prepared.digest)
      grantRequest.effectLimit = 50
      const grant = assembly.effects.lifecycle.authority.authorize(grantRequest)
      assembly.effects.lifecycle.track({
        run: plan.run,
        revision: plan.revision,
        grant: grant.grant.id,
      })
      assembly.effects.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Exercise actual disposable whole-product integration.',
      })
      const contractPath = join(dir, 'contract'),
        searchPath = join(dir, 'search')
      git(root, ['worktree', 'add', '-b', 'wl/contract', contractPath, 'HEAD'])
      writeFileSync(join(contractPath, 'contract.json'), contractBody)
      git(contractPath, ['add', '.'])
      git(contractPath, [
        'commit',
        '-m',
        'feat: define the combined search response contract',
        '-m',
        'Require the frontend and backend to agree on returned task identifiers.',
      ])
      git(webRoot, ['worktree', 'add', '-b', 'wl/search', searchPath, 'HEAD'])
      writeFileSync(
        join(searchPath, 'search.txt'),
        'Find seeded tasks through the combined public API.\n',
      )
      git(searchPath, ['add', '.'])
      git(searchPath, [
        'commit',
        '-m',
        'feat: expose combined title search',
        '-m',
        'Exercise the committed backend interface from the frontend entrypoint.',
      ])
      const parts = [
        {
          work: 'contract',
          repository: 'app',
          path: contractPath,
          ref: 'refs/heads/wl/contract',
          head: git(contractPath, ['rev-parse', 'HEAD']),
        },
        {
          work: 'search',
          repository: 'web',
          path: searchPath,
          ref: 'refs/heads/wl/search',
          head: git(searchPath, ['rev-parse', 'HEAD']),
        },
      ]
      const acceptance = new DeliveryAcceptance(planning.sources.files.root),
        baseCase = {
          criteria: ['search'],
          owner: 'machine' as const,
          applicability: 'applicable' as const,
          rationale:
            'Establish observed combined behavior after independently green component suites.',
          initial: 'A disposable frontend calls its owned backend.',
          actions: [entry(plan.milestones, 0).procedure],
          failureConditions: ['Any API mismatch or failed unit prevents acceptance.'],
          fixture: { ref: 'fixture:combined-title-search', sha256: contract.sha256 },
          timeoutMs: 60000,
        }
      // An actually executed opaque case precedes the public failure. Its
      // private objective and even its public stub must stay out of repair feedback.
      const privateCanary = 'PRIVATE_CORRECTION_OBJECTIVE_CANARY',
        hidden = new PrivateAcceptance(acceptance).prepare({
          schema: 'wholeloop/private-acceptance@1',
          run: plan.run,
          revision: plan.revision,
          plan: prepared.digest,
          source: plan.source,
          case: 'b-private',
          behavior: {
            schema: 'wholeloop/behavior-input@1',
            kind: 'api',
            service: 'web',
            port: 3000,
            steps: [
              { id: 'owned-request', kind: 'request', method: 'GET', path: '/private-status' },
            ],
          },
          assertions: [
            {
              id: 'owned-status',
              subject: 'status',
              operator: 'equals',
              expected: '200',
              description: privateCanary,
            },
          ],
          sensitivity: { mode: 'not-applicable', relevant: ['owned-status'] },
        }),
        privateCase: AcceptanceCase = {
          ...baseCase,
          id: 'b-private',
          actions: ['OPAQUE_CORRECTION_STUB_CANARY'],
          assertions: [
            {
              id: 'private-outcome',
              subject: 'state',
              operator: 'equals',
              path: '/passed',
              expected: 'true',
              description: 'OPAQUE_CORRECTION_ASSERTION_CANARY',
            },
          ],
          runner: {
            kind: 'api',
            capability: 'evaluator.private-http',
            input: JSON.stringify({
              schema: 'wholeloop/private-case-input@1',
              manifest: hidden.digest,
            }),
          },
          fixture: { ref: 'fixture:private-owned-status', sha256: hidden.digest },
        }
      const pinned = acceptance.prepare({
        schema: 'wholeloop/acceptance-plan@1',
        run: plan.run,
        revision: plan.revision,
        plan: prepared.digest,
        source: plan.source,
        cases: [
          ...['backend', 'frontend'].map((service, index) => ({
            ...baseCase,
            id: index === 0 ? 'a-backend-unit' : 'b-frontend-unit',
            fixture: { ref: `fixture:${service}-unit`, sha256: contractDigest(service) },
            actions: ['Run the declared component unit suite.'],
            assertions: [
              {
                id: 'exit',
                subject: 'exit',
                operator: 'equals',
                expected: '0',
                description: 'The observed component suite exits zero.',
              },
            ],
            runner: {
              kind: 'cli',
              capability: 'process.exec',
              input: JSON.stringify({
                schema: 'wholeloop/behavior-input@1',
                kind: 'cli',
                service: service === 'frontend' ? 'web' : service,
                command: `${service}-unit`,
              }),
            },
          })),
          privateCase,
          {
            ...baseCase,
            id: 'c-combined',
            assertions: [
              {
                id: 'ids',
                subject: 'json',
                operator: 'equals',
                path: '/ids',
                expected: '["task-1"]',
                description: 'The combined public endpoint returns agreed task identifiers.',
              },
              {
                id: 'status',
                subject: 'status',
                operator: 'equals',
                expected: '200',
                description: 'The combined frontend/backend operation succeeds.',
              },
            ],
            runner: {
              kind: 'api',
              capability: 'http.request',
              input: JSON.stringify({
                schema: 'wholeloop/behavior-input@1',
                kind: 'api',
                service: 'web',
                port: 3000,
                steps: [
                  { id: 'find', kind: 'request', method: 'GET', path: '/tasks?title=Durable' },
                ],
              }),
            },
          },
        ],
        retention: { reviewAfterMs: 60000, expiryAction: 'retain' },
      })
      let verificationCurrent = true,
        verificationCalls = 0
      const driver = new DockerCli(),
        daemon = dockerJson(await driver.call(['info', '--format', '{{json .}}'])) as {
          Architecture: string
        },
        architecture = ['aarch64', 'arm64'].includes(daemon.Architecture) ? 'arm64' : 'amd64',
        environments = new DeliveryEnvironments(planning.sources.files.root),
        candidates = new IntegrationCandidates(planning.sources.files.root),
        verifier = new IntegrationVerification(planning.sources.files.root, driver, {
          deadline: new Date(Date.now() + plan.budgets.wallTimeMs).toISOString(),
          signal: new AbortController().signal,
          current: () => verificationCurrent,
        }),
        originalCall = driver.call.bind(driver)
      driver.call = (...args) => {
        verificationCalls++
        return originalCall(...args)
      }
      const protectedInput = (id: string, body: string) => {
        const ref = `delivery/integration-inputs/${id}.txt`
        planning.sources.files.atomic(ref, body)
        return { ref, sha256: sourceHash(body) }
      }
      const data = protectedInput('db', '[]\n'),
        verify = protectedInput('verify', 'Pinned required verification policy.\n'),
        review = protectedInput(
          'review',
          'Pinned independent review rubric; no passing review is claimed.\n',
        )
      const prepare = async (key: string, repairOf?: string) => {
        const record = assembly.prepare({
            schema: 'wholeloop/integration-assembly-request@1',
            run: plan.run,
            revision: plan.revision,
            plan: prepared.digest,
            milestone: 'feature',
            key,
            parts,
            ...(repairOf ? { repairOf } : {}),
          }),
          assembled = await assembly.execute(record.digest)
        assert.equal(assembled.status, 'assembled', JSON.stringify(assembled))
        const app = assembled.repositories.find((r) => r.repository === 'app'),
          web = assembled.repositories.find((r) => r.repository === 'web')
        assert.ok(app && web)
        const recipe = environmentRecipe(
          app.path,
          readFileSync(join(app.path, 'app.cjs'), 'utf8'),
          architecture,
        )
        recipe.repositories.push({ id: 'web', root: web.path })
        recipe.files.push({
          id: 'frontend-code',
          repository: 'web',
          ref: 'app.cjs',
          sha256: sourceHash(frontend),
          kind: 'script',
        })
        const backendService = entry(recipe.services, 0)
        backendService.id = 'backend'
        backendService.start.argv = ['node', '/workspace/app/app.cjs']
        backendService.readiness.port = 3001
        backendService.ports = [{ container: 3001, publish: 'none' }]
        backendService.mounts = backendService.mounts.filter((m) => m.kind === 'workspace')
        recipe.services.push({
          ...structuredClone(backendService),
          id: 'web',
          after: ['backend'],
          mounts: [{ kind: 'workspace', source: 'web', target: '/workspace/web', access: 'read' }],
          start: {
            argv: ['node', '/workspace/web/app.cjs'],
            cwd: '/workspace/web',
            origin: { kind: 'file', file: 'frontend-code' },
          },
          readiness: { kind: 'tcp', port: 3000, timeoutMs: 10000 },
          ports: [{ container: 3000, publish: 'loopback' }],
        })
        recipe.limits.memoryMiB = 1024
        recipe.limits.cpus = 3
        for (const [service, repository, file] of [
          ['backend', 'app', 'server'],
          ['web', 'web', 'frontend-code'],
        ] as const)
          recipe.commands.push({
            id: `${service === 'web' ? 'frontend' : service}-unit`,
            service,
            phase: 'test',
            command: {
              argv: ['node', `/workspace/${repository}/app.cjs`, '--unit'],
              cwd: `/workspace/${repository}`,
              origin: { kind: 'file', file },
            },
            timeoutMs: 30000,
          })
        const selected = new EnvironmentRecipes(planning.sources.files.root).prepare(recipe)
        const request: IntegrationRequest = {
          schema: 'wholeloop/integration-candidate-request@1',
          run: plan.run,
          revision: plan.revision,
          plan: prepared.digest,
          milestone: 'feature',
          strategy: 'ordered-merge',
          parts,
          assemblies: assembled.repositories.map((r) => ({
            repository: r.repository,
            path: r.path,
            ref: r.ref,
            base: plan.repositories.find((p) => p.id === r.repository)?.base ?? '',
            head: r.head ?? '',
          })),
          contracts: [{ id: contract.id, revision: contract.revision, sha256: contract.sha256 }],
          inputs: [
            {
              id: 'acceptance',
              kind: 'acceptance',
              ref: pinned.digest,
              sha256: pinned.digest,
              after: ['recipe', 'db'],
            },
            {
              id: 'recipe',
              kind: 'recipe',
              ref: selected.digest,
              sha256: selected.digest,
              after: [],
            },
            { id: 'db', kind: 'data', ...data, after: [] },
            ...plan.repositories.flatMap((repo) =>
              (['verify', 'review'] as const).map((gate) => ({
                id: `${repo.id}-${gate}`,
                kind: 'gate-policy' as const,
                repository: repo.id,
                gate,
                ...(gate === 'verify' ? verify : review),
                after: ['recipe'],
              })),
            ),
          ],
          repairOwners: [{ criterion: 'search', kind: 'integration', id: 'feature' }],
        }
        const candidate = candidates.prepare(request),
          provision = await environments.provision({
            schema: 'wholeloop/environment-provision-request@1',
            run: plan.run,
            recipe: selected.digest,
            key,
            helperImage: DOCKER_REFERENCE_HELPER,
            workspaces: candidate.candidate.assemblies.map((r) => ({
              repository: r.repository,
              path: r.path,
              head: r.head,
              snapshot: r.snapshot,
            })),
          })
        assert.equal(provision.status, 'ready', JSON.stringify(provision))
        assert.ok(provision.environment)
        report.environments.push({
          id: provision.environment.record.id,
          daemon: provision.environment.record.daemon,
        })
        environments.effects.lifecycle.transition(plan.run, {
          to: 'queued',
          reason: 'Observe the complete owned application vector.',
        })
        return {
          record,
          candidate,
          request: {
            schema: 'wholeloop/integration-verification-request@1' as const,
            candidate: candidate.digest,
            assembly: record.digest,
            environment: provision.environment.record.id,
          },
        }
      }
      const originalHeads = plan.repositories.map((r) => git(r.root, ['rev-parse', 'HEAD'])),
        first = await prepare('broken'),
        failed = await verifier.run(first.request)
      assert.equal(failed.status, 'failed', JSON.stringify(failed))
      assert.deepEqual(
        failed.repairs.map((r) => ({
          kind: r.kind,
          id: r.id,
          criteria: r.criteria,
          cases: r.cases,
        })),
        [{ kind: 'integration', id: 'feature', criteria: ['search'], cases: ['c-combined'] }],
      )
      assert.equal(failed.cases.find((c) => c.id === 'a-backend-unit')?.status, 'passed')
      assert.equal(failed.cases.find((c) => c.id === 'b-frontend-unit')?.status, 'passed')
      assert.equal(failed.cases.find((c) => c.id === 'c-combined')?.status, 'failed')
      check('independent-green-components-fail-the-actual-combined-api', failed)
      const history = acceptance.observedResults(pinned.digest, 'c-combined').length
      await verifier.run(first.request)
      assert.equal(acceptance.observedResults(pinned.digest, 'c-combined').length, history)
      check('completed-verification-keys-do-not-repeat-effects', history)
      const lifecycle = new EnvironmentLifecycle(planning.sources.files)
      assert.equal(
        (
          await lifecycle.execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: 'assembly-evaluation-stop',
            environment: first.request.environment,
            expected: lifecycle.records.get(first.request.environment).digest,
            action: 'stop',
            reason:
              'Stop this exact disposable application before provisioning the repaired vector.',
          })
        ).state,
        'retained',
      )
      assert.equal(
        lifecycle.records
          .get(first.request.environment)
          .record.resources.filter((r) => r.kind === 'container')
          .every((r) => r.status === 'stopped'),
        true,
      )
      writeFileSync(join(contractPath, 'app.cjs'), backend(true))
      git(contractPath, ['add', '.'])
      git(contractPath, [
        'commit',
        '-m',
        'fix: align the backend with the approved response contract',
        '-m',
        'Repair the actual combined failure without changing expected behavior.',
      ])
      entry(parts, 0).head = git(contractPath, ['rev-parse', 'HEAD'])
      assert.equal(candidates.inspect(first.candidate.digest).status, 'stale')
      await assert.rejects(verifier.report(first.request))
      check(
        'committed-repair-invalidates-downstream-candidate-and-evidence',
        first.candidate.digest,
      )
      const second = await prepare('repaired', first.record.digest),
        passed = await verifier.run(second.request)
      assert.equal(passed.status, 'passed', JSON.stringify(passed))
      assert.equal(passed.acceptance, 'delegated-machine')
      assert.deepEqual(passed.repairs, [])
      assert.equal(passed.wholeFeature, 'not-established-by-this-receipt')
      check('repaired-complete-vector-passes-real-cli-contract-and-api-checks', passed)
      assert.ok(failed.artifact && passed.artifact)
      const passedArtifact = passed.artifact
      assert.equal(
        JSON.parse(acceptance.artifacts.bytes(plan.run, failed.artifact).toString('utf8')).status,
        'failed',
      )
      assert.equal(
        JSON.parse(acceptance.artifacts.bytes(plan.run, passed.artifact).toString('utf8')).status,
        'passed',
      )
      check('complete-budgeted-failed-and-passed-reports-remain-verifiable', [
        failed.artifact,
        passed.artifact,
      ])
      const originalFailed = observedIntegrationVerification(
          planning.sources.files.root,
          first.request,
          failed.artifact,
        ),
        originalPassed = observedIntegrationVerification(
          planning.sources.files.root,
          second.request,
          passedArtifact,
        )
      for (const [proof, selection] of [
        [originalFailed, first.request],
        [originalPassed, second.request],
      ] as const) {
        const feedback = integrationCorrectionCases(
            pinned.plan.cases,
            proof.cases.map(({ result }) => result),
          ),
          opaque = feedback.find((test) => test.case === privateCase.id),
          publicCase = feedback.find((test) => test.case === 'c-combined'),
          text = JSON.stringify(feedback)
        assert.deepEqual(opaque, { case: 'b-private', status: 'passed' })
        assert.ok(publicCase?.actions?.length)
        for (const canary of [
          privateCanary,
          'OPAQUE_CORRECTION_STUB_CANARY',
          'OPAQUE_CORRECTION_ASSERTION_CANARY',
          hidden.digest,
        ])
          assert.equal(text.includes(canary), false)
        // The reader locator is synthetic; the original Docker/Git proof it
        // references is real. This does not certify a native root-stage launch.
        const store = new RunnerStore(planning.sources.files.root),
          request: RunnerRequest = {
            schema: 'wholeloop/delivery-runner-request@1',
            key: `feedback-${proof.report.status}`,
            run: plan.run,
            revision: plan.revision,
            plan: prepared.digest,
            grant: grant.grant.id,
            host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
            pollMs: 50,
          },
          digest = store.prepare(request).digest,
          lease = store.claim(digest, `controller-${contractDigest(request).slice(0, 32)}`),
          stage = 'integration:feature',
          invocation = contractDigest({ digest, stage }),
          base = `delivery/runner-integrations/${invocation}`
        store.append(lease, { action: 'dispatched', stage, invocation })
        store.append(lease, {
          action: 'started',
          stage,
          invocation,
          runtime: { backend: 'fixture', instance: invocation, worker: stage },
        })
        store.append(lease, {
          action: 'observed',
          stage,
          invocation,
          status: proof === originalFailed ? 'failed' : 'passed',
          evidence: proof.evidence,
          provenance: 'fixture',
          reason: 'Synthetic locator for original product-proof privacy inspection.',
        })
        store.files.atomic(
          `${base}/binding.json`,
          JSON.stringify({
            version: 1,
            request: digest,
            plan: prepared.digest,
            stage,
            invocation,
            at: proof.cases[0]?.result.startedAt,
            deadline: new Date(
              Date.parse(proof.cases.at(-1)?.result.endedAt ?? '') + 1,
            ).toISOString(),
            selection,
          }),
        )
        store.files.atomic(
          `${base}/report.json`,
          JSON.stringify({ artifact: proof === originalFailed ? failed.artifact : passedArtifact }),
        )
        const reader = new RunnerIntegrationStages(
            store,
            new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map())),
          ),
          record = store.stage(digest, stage)
        assert.ok(record)
        assert.deepEqual(reader.failedCases(request, record), feedback)
        store.release(lease, 'Retain this synthetic locator without running controller work.')
        check(
          `verified-${proof.report.status}-correction-feedback-keeps-private-cases-opaque`,
          feedback,
        )
      }
      assert.equal(originalFailed.report.status, 'failed')
      assert.equal(originalPassed.report.status, 'passed')
      assert.equal(originalPassed.nativeOwnership, 'not-established')
      assert.equal(originalPassed.currentAcceptance, 'not-established')
      check(
        'exact-original-combined-failure-and-success-reopen-without-current-candidate-approval',
        [originalFailed.evidence, originalPassed.evidence],
      )
      const changes = [
        (body: typeof originalPassed.report) => {
          body.status = 'failed'
        },
        (body: typeof originalPassed.report) => {
          body.checks.pop()
        },
        (body: typeof originalPassed.report) => {
          body.cases.pop()
        },
        (body: typeof originalPassed.report) => {
          entry(body.cases, 0).evidence = []
        },
        (body: typeof originalPassed.report) => {
          entry(body.cases, 0).status = 'failed'
        },
        (body: typeof originalPassed.report) => {
          body.bindings.runtime = 'f'.repeat(64)
        },
        (body: typeof originalPassed.report) => {
          body.repairs = structuredClone(failed.repairs)
        },
        (body: typeof originalPassed.report) => {
          body.acceptance = 'not-established'
        },
      ]
      for (const change of changes) {
        const body = structuredClone(originalPassed.report)
        change(body)
        const altered = acceptance.artifacts.capture(
            plan.run,
            Buffer.from(JSON.stringify(body)),
            'application/json',
          ),
          journal = contractDigest(assembly.effects.lifecycle.journal.events())
        assert.throws(() =>
          observedIntegrationVerification(
            planning.sources.files.root,
            second.request,
            altered.digest,
          ),
        )
        assert.equal(contractDigest(assembly.effects.lifecycle.journal.events()), journal)
      }
      assert.throws(() =>
        observedIntegrationVerification(planning.sources.files.root, first.request, passedArtifact),
      )
      check(
        'substituted-report-status-coverage-cases-bindings-and-repair-claims-refuse-without-replay',
        changes.length,
      )
      verificationCurrent = false
      const callsBefore = verificationCalls,
        journalBefore = contractDigest(assembly.effects.lifecycle.journal.events())
      await assert.rejects(verifier.run(second.request), /acceptance-controller-fenced/)
      assert.equal(verificationCalls, callsBefore)
      assert.equal(contractDigest(assembly.effects.lifecycle.journal.events()), journalBefore)
      assert.deepEqual(
        observedIntegrationVerification(
          planning.sources.files.root,
          second.request,
          passedArtifact,
        ),
        originalPassed,
      )
      check(
        'fenced-original-parent-prevents-integrated-dispatch-and-docker-reads-without-losing-history',
        callsBefore,
      )
      assert.deepEqual(
        plan.repositories.map((r) => git(r.root, ['rev-parse', 'HEAD'])),
        originalHeads,
      )
      assert.equal(
        readFileSync(join(searchPath, 'search.txt'), 'utf8'),
        'Find seeded tasks through the combined public API.\n',
      )
      check('personal-targets-and-independent-worker-files-remain-preserved', originalHeads)
      assert.equal(passed.publication, 'not-performed')
      assert.equal(passed.rollback, 'not-performed')
      check('two-repository-acceptance-does-not-claim-atomic-delivery-or-rollback', passed.checks)
      if (process.argv.includes('--retire-success')) {
        for (const environment of report.environments)
          assert.equal(
            (
              await lifecycle.execute({
                schema: 'wholeloop/environment-lifecycle-request@1',
                id: 'assembly-evaluation-retire',
                environment: environment.id,
                expected: lifecycle.records.get(environment.id).digest,
                action: 'retire',
                reason:
                  'Retire only this exact owned disposable integration environment after retaining evidence.',
              })
            ).state,
            'retired',
          )
        report.retirement = 'observed'
        check(
          'exact-owned-environments-retired-with-evidence-preserved',
          report.environments.map((e) => e.id),
        )
        assembly.effects.lifecycle.transition(plan.run, {
          to: 'paused',
          reason: 'Reopen original integrated observations after exact environment retirement.',
        })
        const journal = contractDigest(assembly.effects.lifecycle.journal.events())
        assert.deepEqual(
          observedIntegrationVerification(
            planning.sources.files.root,
            first.request,
            failed.artifact,
          ),
          originalFailed,
        )
        assert.deepEqual(
          observedIntegrationVerification(
            planning.sources.files.root,
            second.request,
            passed.artifact,
          ),
          originalPassed,
        )
        assert.equal(contractDigest(assembly.effects.lifecycle.journal.events()), journal)
        check(
          'paused-retired-original-combined-evidence-recovery-preserves-all-journal-entries',
          journal,
        )
      }
      report.status = 'passed'
    },
    { retain: true },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Unavailable assembly evaluation'
  process.exitCode = 1
} finally {
  acceptanceShape(report, evaluationSchema)
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
