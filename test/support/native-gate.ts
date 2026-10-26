import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeProcessRunner } from '../../src/delivery/native-host.js'
import { FlowEngine } from '../../src/flow/engine.js'
import type { GatePlan } from '../../src/gates/contracts.js'
import { GateWorkflow } from '../../src/gates/workflow.js'
import { DEFAULT_REVIEW_RUBRIC, prepareReviewInput } from '../../src/review/input.js'
import { type RunnerGateOptions, RunnerNativeGateHost } from '../../src/runner/native-gate.js'
import { RunnerNativeStage } from '../../src/runner/native-stage.js'
import { StateStore } from '../../src/state/store.js'
import { type GateFixtureMode, gateWorkerFixture } from './gate-worker.js'
import { runnerGitFixture } from './runner-git.js'

export async function nativeGateFixture(
  operation: (input: {
    store: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['store']
    context: Parameters<Parameters<typeof runnerGitFixture>[0]>[0]['dispatch'] extends (
      id: string,
    ) => infer T
      ? T
      : never
    gate: GatePlan
    review: ReturnType<typeof prepareReviewInput>
    gates: GateWorkflow
    engine: FlowEngine
    options(process: NativeProcessRunner): RunnerGateOptions
    run<T>(callback: (host: RunnerNativeGateHost) => Promise<T>): Promise<T>
  }) => Promise<void>,
  mode: GateFixtureMode = 'valid',
  provenance: 'fixture' | 'host-observed' = 'fixture',
  stageBudget?: 'plan',
  unattended = false,
) {
  await runnerGitFixture(
    async ({ store, host: gitHost, request, root, dispatch, observe }) => {
      observe(await gitHost.execute(dispatch('workspace:search')))
      const workspace = gitHost.workspace(request, 'search').repository.path
      writeFileSync(join(workspace, 'app.txt'), 'Committed fixture candidate.\n')
      observe(await gitHost.execute(dispatch('commit:search')))
      const engine = new FlowEngine(
          new StateStore(store.files.root),
          root,
          store.files.path('fixture-config.yml'),
          store.files.path('fixture-home'),
        ),
        subject = engine.store.create({
          kind: 'review',
          title: 'Owned delivery candidate review',
          owner: 'Fixture Owner',
          body: 'No human approval is implied.',
          repository: workspace,
        }).id,
        gates = new GateWorkflow(engine),
        gate = gates.plan(subject, 'review', { repo: workspace, base: 'main' }).plan,
        review = prepareReviewInput(engine, gate),
        context = dispatch('review:search'),
        options = gateWorkerFixture(store, workspace, mode, provenance)
      await operation({
        store,
        context,
        gate,
        gates,
        review,
        engine,
        options,
        run: (callback) =>
          new RunnerNativeStage(store, context).run((nativeProcess) =>
            callback(
              new RunnerNativeGateHost(store, context, engine, gate, options(nativeProcess)),
            ),
          ),
      })
    },
    {
      singleUnit: true,
      guidance: DEFAULT_REVIEW_RUBRIC,
      ...(stageBudget ? { stageBudget } : {}),
      ...(unattended
        ? {
            configure: (plan) => {
              plan.policy.intervention = 'none'
            },
          }
        : {}),
    },
  )
}
