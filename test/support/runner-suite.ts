import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
  } = {},
) {
  if (options.production && options.unit)
    throw new Error('Production fixture requires its search unit')
  const app =
      "require('node:http').createServer((_request,response)=>response.end('owned suite fixture')).listen(3000,'0.0.0.0')\n",
    check = `process.stdout.write('observed suite\\n');process.exitCode=${options.exit ?? 0}\n`,
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
        pinned = acceptance.prepare({
          schema: 'wholeloop/acceptance-plan@1',
          run: request.run,
          revision: request.revision,
          plan: request.plan,
          source: store.basis(request).plan.source,
          cases: [
            {
              id: 'suite',
              criteria: ['search'],
              owner: 'machine',
              applicability: 'applicable',
              rationale: 'This case records repository-suite facts only.',
              initial: 'The owned candidate contains its declared check.',
              actions: ['Run the declared project suite.'],
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
      ...(options.unit || options.unattended
        ? {
            configure: (plan) => {
              if (options.unattended) plan.policy.intervention = 'none'
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
