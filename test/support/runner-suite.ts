import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BROWSER_REFERENCE } from '../../src/acceptance/browser-reference.js'
import { PrivateAcceptance } from '../../src/acceptance/private-plan.js'
import { DeliveryAcceptance } from '../../src/acceptance/store.js'
import { sourceHash } from '../../src/delivery/input.js'
import { DockerCli, type DockerTransport } from '../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../src/environment/docker-policy.js'
import { DeliveryEnvironments } from '../../src/environment/provision.js'
import { EnvironmentResources } from '../../src/environment/runtime.js'
import { FlowEngine } from '../../src/flow/engine.js'
import { GateWorkflow } from '../../src/gates/workflow.js'
import { DEFAULT_REVIEW_RUBRIC } from '../../src/review/input.js'
import { type RunnerSuiteSelection, RunnerSuiteStages } from '../../src/runner/suite-stages.js'
import { StateStore } from '../../src/state/store.js'
import { environmentRecipe } from './environment.js'
import { runnerGitFixture } from './runner-git.js'
import { runnerWorkerComponents } from './runner-worker.js'

export async function runnerSuiteFixture(
  run: (input: {
    store: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['store']
    dispatch: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['dispatch']
    observe: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['observe']
    context: Parameters<RunnerSuiteStages['execute']>[0]
    suite: RunnerSuiteStages
    engine: FlowEngine
    gate: Parameters<RunnerSuiteStages['execute']>[1]
    selection: RunnerSuiteSelection
    driver: DockerTransport
    production?: ReturnType<typeof runnerWorkerComponents>
  }) => Promise<void>,
  options: {
    unit?: 'contract'
    unattended?: boolean
    backend?: 'docker'
    retain?: boolean
    exit?: 0 | 7
    guidance?: string
    production?: boolean
    repairSensitive?: boolean
    secondRepairSensitive?: boolean
    noProgress?: number
    successor?: boolean
    productQa?: boolean
    productQaFailure?: boolean
    productQaApi?: boolean
    productQaPrivate?: boolean
    privateRegression?: boolean
    privateMismatch?: boolean
    productQaBrowser?: boolean
    browserMismatch?: boolean
  } = {},
) {
  if (options.production && options.unit)
    throw new Error('Production fixture requires its search unit')
  const design = 'The application displays the Owned suite fixture heading.\n',
    app = options.productQaBrowser
      ? "require('node:http').createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><title>Owned suite fixture</title><h1>Owned suite fixture</h1>')}).listen(3000,'0.0.0.0')\n"
      : options.productQaApi || options.productQaPrivate
        ? "require('node:http').createServer((_request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({status:'owned suite fixture'}))}).listen(3000,'0.0.0.0')\n"
        : "require('node:http').createServer((_request,response)=>response.end('owned suite fixture')).listen(3000,'0.0.0.0')\n",
    check = options.secondRepairSensitive
      ? `const fs=require('node:fs');process.exitCode=fs.readFileSync('app.txt','utf8')==='Synthetic owned second correction.\\n'?0:7\n`
      : options.repairSensitive
        ? `const fs=require('node:fs');process.exitCode=fs.readFileSync('app.txt','utf8')==='Synthetic owned correction.\\n'?0:7\n`
        : options.productQaFailure
          ? "process.stdout.write('observed suite\\n');process.exitCode=process.argv.includes('--root-fail')?7:0\n"
          : `process.stdout.write('observed suite\\n');process.exitCode=${options.exit ?? 0}\n`,
    pkg = JSON.stringify({ private: true, scripts: { check: 'node suite.cjs' } }),
    contractBody = 'Title query returns matching task IDs.\n',
    unit = options.unit ?? 'search',
    timeoutMs = options.backend === 'docker' ? 30000 : 5000
  await runnerGitFixture(
    async (input) => {
      const { store, host, request, dispatch, observe, root } = input
      observe(await host.execute(dispatch(`workspace:${unit}`)))
      const workspace = host.workspace(request, unit).repository.path
      const acceptance = new DeliveryAcceptance(store.files.root),
        hidden = options.productQaPrivate
          ? new PrivateAcceptance(acceptance).prepare({
              schema: 'wholeloop/private-acceptance@1',
              run: request.run,
              revision: request.revision,
              plan: request.plan,
              source: store.basis(request).plan.source,
              case: 'private-product',
              behavior: {
                schema: 'wholeloop/behavior-input@1',
                kind: 'api',
                service: 'web',
                port: 3000,
                steps: [{ id: 'read', kind: 'request', method: 'GET', path: '/' }],
              },
              assertions: [
                {
                  id: 'private-response',
                  description: 'The assembled service returns the pinned private response.',
                  subject: 'json',
                  operator: 'equals',
                  path: '/status',
                  expected: JSON.stringify(
                    options.privateMismatch ? 'different private fixture' : 'owned suite fixture',
                  ),
                },
              ],
              sensitivity: {
                mode: options.privateRegression ? 'regression' : 'new-feature',
                relevant: ['private-response'],
              },
            })
          : undefined,
        pinned = acceptance.prepare({
          schema: 'wholeloop/acceptance-plan@1',
          run: request.run,
          revision: request.revision,
          plan: request.plan,
          source: store.basis(request).plan.source,
          cases: [
            ...(options.productQaBrowser
              ? [
                  {
                    id: 'browser-product',
                    criteria: ['search'],
                    owner: 'machine',
                    applicability: 'applicable',
                    rationale:
                      'Observe the assembled application through the pinned isolated browser and original private stdio owner.',
                    initial: 'The exact assembled application and pinned browser are ready.',
                    actions: store
                      .basis(request)
                      .plan.milestones.map((milestone) => milestone.procedure),
                    assertions: [
                      {
                        id: 'heading',
                        subject: 'state',
                        operator: 'equals',
                        path: '/checks/heading',
                        expected: 'true',
                        description: 'The real browser observes the pinned application heading.',
                      },
                    ],
                    failureConditions: ['A missing heading fails the original browser case.'],
                    runner: {
                      kind: 'browser',
                      capability: 'browser.journey',
                      input: JSON.stringify({
                        schema: 'wholeloop/browser-input@1',
                        service: 'web',
                        port: 3000,
                        browser: {
                          service: 'browser',
                          reference: BROWSER_REFERENCE.id,
                          tools: BROWSER_REFERENCE.digest,
                        },
                        grounding: [{ file: 'design', sha256: sourceHash(design) }],
                        persistence: 'not-applicable',
                        steps: [
                          { id: 'open', kind: 'navigate', path: '/' },
                          { id: 'capture', kind: 'capture', label: 'original-page' },
                          {
                            id: 'heading',
                            kind: 'check',
                            assertion: 'heading',
                            text: options.browserMismatch
                              ? 'Missing original heading'
                              : 'Owned suite fixture',
                            mode: 'present',
                          },
                        ],
                      }),
                    },
                    fixture: { ref: 'fixture:browser-root-product', sha256: sourceHash(app) },
                    timeoutMs: 120000,
                  },
                ]
              : []),
            ...(hidden
              ? [
                  {
                    id: 'private-product',
                    criteria: ['search'],
                    owner: 'machine',
                    applicability: 'applicable',
                    rationale:
                      'Observe the assembled service through the fixed evaluator without exposing its private inputs to the application.',
                    initial: 'The original assembled service and private definition are available.',
                    actions: store
                      .basis(request)
                      .plan.milestones.map((milestone) => milestone.procedure),
                    assertions: [
                      {
                        id: 'private-outcome',
                        description: 'Every original private objective assertion passes.',
                        subject: 'state',
                        operator: 'equals',
                        path: '/passed',
                        expected: 'true',
                      },
                    ],
                    failureConditions: ['Any private objective mismatch fails the product check.'],
                    runner: {
                      kind: 'api',
                      capability: 'evaluator.private-http',
                      input: JSON.stringify({
                        schema: 'wholeloop/private-case-input@1',
                        manifest: hidden.digest,
                      }),
                    },
                    fixture: { ref: 'fixture:private-root-product', sha256: hidden.digest },
                    timeoutMs: 120000,
                  },
                ]
              : []),
            {
              id: 'suite',
              criteria: ['search'],
              owner: 'machine',
              applicability: 'applicable',
              rationale: 'This case records repository-suite facts only.',
              initial: 'The owned candidate contains its declared check.',
              actions: [
                'Run the declared project suite.',
                ...(options.productQa
                  ? store.basis(request).plan.milestones.map((milestone) => milestone.procedure)
                  : []),
              ],
              assertions: [
                {
                  id: 'exit',
                  description: 'The declared command exits zero.',
                  subject: 'exit',
                  operator: 'equals',
                  expected: '0',
                },
              ],
              failureConditions: ['A nonzero exit fails the repository suite.'],
              runner: {
                kind: 'cli',
                capability: 'process.exec',
                input: JSON.stringify({
                  schema: 'wholeloop/behavior-input@1',
                  kind: 'cli',
                  service: 'web',
                  command: 'suite',
                }),
              },
              fixture: { ref: 'fixture:declared-suite', sha256: sourceHash(check) },
              timeoutMs,
            },
            ...(options.productQaApi
              ? [
                  {
                    id: 'product-api',
                    criteria: ['search'],
                    owner: 'machine',
                    applicability: 'applicable',
                    rationale:
                      'Observe the declared assembled application service through its public HTTP endpoint.',
                    initial: 'The exact assembled fixture service is ready.',
                    actions: store
                      .basis(request)
                      .plan.milestones.map((milestone) => milestone.procedure),
                    assertions: [
                      {
                        id: 'response',
                        description: 'The assembled service returns the pinned fixture response.',
                        subject: 'json',
                        operator: 'equals',
                        path: '/status',
                        expected: '"owned suite fixture"',
                      },
                    ],
                    failureConditions: ['A different response fails the assembled-service check.'],
                    runner: {
                      kind: 'api',
                      capability: 'http.request',
                      input: JSON.stringify({
                        schema: 'wholeloop/behavior-input@1',
                        kind: 'api',
                        service: 'web',
                        port: 3000,
                        steps: [{ id: 'read', kind: 'request', method: 'GET', path: '/' }],
                      }),
                    },
                    fixture: { ref: 'fixture:assembled-service', sha256: sourceHash(app) },
                    timeoutMs,
                  },
                ]
              : []),
          ],
          retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
        })
      const production = options.production
        ? runnerWorkerComponents(input, 'complete', {
            guidance: options.guidance ?? DEFAULT_REVIEW_RUBRIC,
            provenance: 'host-observed',
          })
        : undefined
      if (production) {
        const observed = await production.workers.execute(dispatch('implementation:search'))
        if (observed.status !== 'passed')
          throw new Error(`Suite fixture production unavailable: ${JSON.stringify(observed)}`)
        observe(observed)
      } else writeFileSync(join(workspace, 'app.txt'), 'Owned suite fixture candidate.\n')
      observe(await host.execute(dispatch(`commit:${unit}`)))
      const candidate = host.candidate(request, unit),
        context = dispatch(`verification:${unit}`),
        engine = new FlowEngine(
          new StateStore(store.files.root),
          root,
          store.files.path('fixture-config.yml'),
          store.files.path('fixture-home'),
        ),
        subject = engine.store.create({
          kind: 'review',
          title: 'Verify the owned candidate',
          owner: 'Fixture Owner',
          body: 'No human approval or behavioral acceptance is recorded.',
          repository: workspace,
        }).id,
        gate = new GateWorkflow(engine).plan(subject, 'verify', {
          repo: workspace,
          base: 'main',
          ...(options.unit
            ? {
                contracts: {
                  run: context.plan.run,
                  revision: context.plan.revision,
                  unit,
                  refs: { 'search-api': 'search-contract.txt' },
                },
              }
            : {
                criteria: [
                  {
                    id: 'search',
                    text: 'The declared repository check completes.',
                    test: 'Observe the original declared command and exact exit.',
                  },
                ],
              }),
        }).plan,
        declaredEnvironment = `environment-${'a'.repeat(32)}`,
        authority = store.lifecycle.authority.inspect(request.grant)
      let environment = declaredEnvironment
      const driver: DockerTransport =
        options.backend === 'docker'
          ? new DockerCli()
          : {
              provenance: 'fixture',
              call: async () => {
                throw new Error('A metadata-only fixture cannot execute Docker')
              },
            }
      if (options.backend === 'docker') {
        const environments = new DeliveryEnvironments(store.files.root, driver),
          recipe = environmentRecipe(root, app, process.arch === 'x64' ? 'amd64' : 'arm64')
        if (options.productQaBrowser) {
          recipe.files.push({
            id: 'design',
            repository: 'app',
            ref: 'ui-contract.md',
            sha256: sourceHash(design),
            kind: 'guidance',
          })
        }
        recipe.files.push(
          {
            id: 'package',
            repository: 'app',
            ref: 'package.json',
            sha256: sourceHash(pkg),
            kind: 'package',
          },
          {
            id: 'suite',
            repository: 'app',
            ref: 'suite.cjs',
            sha256: sourceHash(check),
            kind: 'script',
          },
        )
        recipe.commands.push({
          id: 'suite',
          service: 'web',
          phase: 'test',
          command: {
            argv: ['npm', 'run', 'check'],
            cwd: '/workspace/app',
            origin: { kind: 'package-script', file: 'package', script: 'check' },
          },
          timeoutMs: 5000,
        })
        const prepared = environments.recipes.prepare(recipe),
          result = await environments.provision({
            schema: 'wholeloop/environment-provision-request@1',
            run: request.run,
            recipe: prepared.digest,
            key: 'runner-suite',
            helperImage: DOCKER_REFERENCE_HELPER,
            workspaces: [
              {
                repository: 'app',
                path: workspace,
                head: candidate.receipt.head,
                snapshot: gate.snapshot.digest,
              },
            ],
          })
        if (result.status !== 'ready' || !result.environment)
          throw new Error(`Actual suite environment unavailable: ${result.status}`)
        environment = result.environment.record.id
        // Provisioning settles its original effect but does not resume a route.
        // The trusted controller explicitly returns ready work to the queue.
        environments.effects.lifecycle.transition(request.run, {
          to: 'queued',
          reason: 'Continue the original route after observing environment readiness.',
        })
      } else {
        // Metadata-only fixture for admission/uncertainty tests. It establishes no
        // Docker readiness or execution; positive acceptance needs the real backend.
        new EnvironmentResources(store.files).create({
          schema: 'wholeloop/environment-runtime@1',
          id: declaredEnvironment,
          run: request.run,
          basis: request.plan,
          recipe: 'b'.repeat(64),
          key: 'suite-fixture',
          grant: request.grant,
          grantDigest: authority.digest,
          token: 'owned-fixture-nonce',
          effect: `effect-${'c'.repeat(32)}`,
          createdAt: store.now(),
          deadline: context.deadline,
          lifetimeDeadline: context.deadline,
          state: 'ready',
          provenance: 'fixture',
          helperImage: DOCKER_REFERENCE_HELPER,
          host: { os: 'linux', architecture: 'arm64' },
          candidates: [
            {
              repository: 'app',
              path: workspace,
              head: candidate.receipt.head,
              snapshot: gate.snapshot.digest,
              content: 'd'.repeat(64),
            },
          ],
          resources: [],
          observations: [],
          acceptance: 'not-established',
          publication: 'not-performed',
        })
      }
      const selection: RunnerSuiteSelection = {
          acceptance: pinned.digest,
          environment,
          refs: ['package.json#check'],
          timeoutMs,
          mapping: { 'package.json#check': 'suite' },
        },
        suite = new RunnerSuiteStages(store, { identity: request.host, engine: () => engine })
      await run({
        store,
        dispatch,
        observe,
        context,
        suite,
        engine,
        gate,
        selection,
        driver,
        ...(production ? { production } : {}),
      })
    },
    {
      singleUnit: !options.unit,
      ...(options.unit ||
      options.unattended ||
      options.noProgress !== undefined ||
      options.successor
        ? {
            configure: (plan) => {
              if (options.unattended) plan.policy.intervention = 'none'
              if (options.noProgress !== undefined) plan.budgets.noProgress = options.noProgress
              if (options.successor) {
                const first = plan.work.find((work) => work.id === 'search')
                if (!first) throw new Error('Fixture predecessor missing')
                plan.work.push({
                  ...first,
                  id: 'followup',
                  role: 'contract',
                  criteria: [],
                  after: ['search'],
                  consumes: [],
                  produces: [
                    {
                      id: 'followup-contract',
                      revision: 'v1',
                      sha256: sourceHash('Declared successor contract.\n'),
                      description:
                        'An unproduced fixture contract; only predecessor incorporation is exercised.',
                    },
                  ],
                })
                for (const milestone of plan.milestones) milestone.work.push('followup')
              }
              if (!options.unit) return
              const declared = plan.work.find((work) => work.id === 'contract')?.produces[0]
              if (!declared) throw new Error('Fixture declared contract missing')
              declared.sha256 = sourceHash(contractBody)
            },
          }
        : {}),
      seed: {
        'package.json': pkg,
        'app.cjs': app,
        'suite.cjs': check,
        ...(options.productQaBrowser ? { 'ui-contract.md': design } : {}),
        ...(options.unit ? { 'search-contract.txt': contractBody } : {}),
      },
      ...(options.guidance !== undefined || options.production
        ? { guidance: options.guidance ?? DEFAULT_REVIEW_RUBRIC }
        : {}),
      ...(options.backend ? { stageBudget: 'plan' as const } : {}),
      ...(options.retain ? { retain: true } : {}),
    },
  )
}
