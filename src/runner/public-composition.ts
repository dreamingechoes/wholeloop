import { userInfo } from 'node:os'
import { dirname } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import type { NativeBinding, NativeBindings } from '../delivery/native-bindings.js'
import { ClaudeBoundaryHost } from '../delivery/native-claude-boundary.js'
import { CodexBoundaryHost } from '../delivery/native-codex-boundary.js'
import type { NativeProcessRunner, NativeRunOptions } from '../delivery/native-host.js'
import { NativePurposeAttempts } from '../delivery/native-purpose.js'
import { type NativeRuntime, nativeRuntimeClient } from '../delivery/native-runtime.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { DeliveryQueue } from '../delivery/queue.js'
import { DeliverySources } from '../delivery/source.js'
import type { WorkerAssignment, WorkerRole } from '../delivery/worker-protocol.js'
import { canonicalPath } from '../state/paths.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerPlanStages } from './plan-stages.js'
import type { PublicHostComposer } from './public-host.js'
import { RunnerResearchStages } from './research-stages.js'
import { NativeResearchWorkers, RunnerResearchAttempts } from './research-workers.js'
import { runnerDecisionRequirements } from './route.js'
import { RunnerStageDispatcher } from './stage-dispatcher.js'
import type { RunnerStore } from './store.js'

/** Routes the public host composes so far; every other route stays unsupported. */
const COMPOSED = ['research-report']
/** The only built-in source the owner chose for unattended research (ADR-0204). */
const WEB = {
  id: 'native-web:source.web',
  provider: 'native-web',
  capability: 'source.web',
  operation: 'source.web.query',
  available: true,
  evidence: "Built-in native web provider: the bound client's own read-only search and fetch.",
}

/** One binding must cover every role in the list; the client is chosen by roles, never by model text. */
function bindingFor(bindings: Readonly<NativeBindings>, roles: WorkerRole[]) {
  return bindings.bindings.find((binding) => roles.every((role) => binding.roles.includes(role)))
}

/**
 * Native options for one bound client. The client binary and its home come
 * from the runtime document; containment and observation are fixed here.
 */
export function publicNativeOptions(
  store: RunnerStore,
  binding: Readonly<NativeBinding>,
  runtime: Readonly<NativeRuntime>,
  output?: 'files' | 'inline-proposal',
): ((process: NativeProcessRunner) => NativeRunOptions) | undefined {
  const entry = nativeRuntimeClient(runtime, binding.target)
  if (!entry) return undefined
  const base = { target: binding.target, version: binding.version, model: binding.model }
  if (binding.target === 'codex') {
    const path = `${dirname(entry.client)}:${dirname(process.execPath)}:/usr/bin:/bin`
    return (runner) => ({
      ...base,
      path,
      nativeStore: entry.store,
      ...(output ? { output } : {}),
      process: runner,
      host: new CodexBoundaryHost(store.files, {
        path,
        nativeStore: entry.store,
        ...(output ? { output } : {}),
        provenance: 'host-observed',
        process: runner,
        current: () => true,
      }),
    })
  }
  const account = userInfo(),
    containment = {
      kind: 'macos-sandbox' as const,
      sandbox: '/usr/bin/sandbox-exec',
      client: canonicalPath(entry.client),
      home: canonicalPath(account.homedir),
      user: account.username,
      store: canonicalPath(entry.store),
    }
  return (runner) => ({
    ...base,
    path: '/usr/bin:/bin',
    nativeStore: containment.store,
    containment,
    ...(output ? { output } : {}),
    process: runner,
    host: new ClaudeBoundaryHost(store.files, {
      path: '/usr/bin:/bin',
      containment,
      ...(output ? { output } : {}),
      provenance: 'host-observed',
      process: runner,
      current: () => true,
    }),
  })
}

/** Evidence is the exact stored artifact bytes; anything else stays unknown. */
function evidenceHost(store: RunnerStore) {
  return {
    prerequisites: () => ({
      supported: true,
      humanRequired: false,
      interactive: 'disabled' as const,
    }),
    observeEvidence: (decision: Readonly<DecisionRequest>) =>
      decision.evidence.map((entry) => {
        let observed: string | undefined
        try {
          observed = sourceHash(readSourceFile(store.files.root, entry.ref, 8 * 1024 * 1024))
        } catch {
          observed = undefined
        }
        return {
          ...entry,
          status: observed === entry.sha256 ? ('passed' as const) : ('unknown' as const),
          // A missing or unreadable artifact is an observation too, never a pass.
          observation: observed ?? 'artifact-unreadable',
          provenance: 'host-observed' as const,
        }
      }),
  }
}

function requests(store: RunnerStore) {
  return (context: RunnerStageContext, artifact: { ref: string; sha256: string }) =>
    runnerDecisionRequirements(
      context.plan as DeliveryPlan,
      context.stage,
      store.lifecycle.authority.inspect(context.request.grant).grant.basis.kind,
    ).map(
      ({ id }): DecisionRequest => ({
        schema: 'wholeloop/delegated-decision-request@1',
        key: `${id}-${context.invocation.slice(0, 32)}`,
        grant: context.request.grant,
        run: context.request.run,
        revision: context.plan.revision,
        plan: context.request.plan,
        decision: id,
        artifacts: [artifact],
        evidence: [{ id: 'production', ...artifact }],
        unknowns: [],
      }),
    )
}

/**
 * The controller bundle's composer (ADR-0205). It composes only the research
 * route for now; any other endpoint, a missing runtime client or a role no
 * single binding covers leaves the route unsupported before dispatch.
 */
export const composePublicHost: PublicHostComposer = ({ store, request, plan, configuration }) => {
  if (!COMPOSED.includes(plan.policy.endpoint)) return undefined
  const { bindings, runtime } = configuration,
    judges = bindingFor(bindings, ['planner', 'challenger']),
    // Angle workers are researchers that run as planner assignments, and claim
    // examiners run as challengers; one binding must allow all three.
    researchers = bindingFor(bindings, ['researcher', 'planner', 'challenger']),
    // Read-only attempts always launch with inline proposals; the observer
    // must regenerate exactly that recipe or it refuses the launch.
    judging = judges && publicNativeOptions(store, judges, runtime, 'inline-proposal'),
    sources = researchers && publicNativeOptions(store, researchers, runtime, 'inline-proposal')
  if (!judging || !sources) return undefined
  const environment: WorkerAssignment['environment'] = {
      id: 'public-native-research',
      recipe: contractDigest({ runtime }),
      boundary: contractDigest({ bindings }),
    },
    queue = () => new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock),
    host = (process: NativeProcessRunner) =>
      new NativeDelegatedDecisionHost(new NativePurposeAttempts(queue()), evidenceHost(store), {
        native: judging(process),
        environment,
        provenance: 'host-observed',
      }),
    decide = requests(store)
  return new RunnerStageDispatcher(store, request.host, {
    plan: new RunnerPlanStages(store, { identity: request.host, requests: decide, host }),
    research: new RunnerResearchStages(store, {
      identity: request.host,
      plan: (context) => ({
        schema: 'wholeloop/research-plan@1',
        subject: context.request.run,
        run: context.request.run,
        // The pinned source snapshot the plan names, never live intake text.
        question: new DeliverySources(store.files.root).get(context.plan.source).body,
        owner: context.plan.owner,
        verifiers: 3,
        refutations: 2,
        angles: [WEB],
        openQuestions: [],
      }),
      workers: (process, context) =>
        new NativeResearchWorkers(new RunnerResearchAttempts(queue()), {
          run: context.request.run,
          grant: context.request.grant,
          native: sources(process),
          environment,
          provenance: 'host-observed',
          deadline: context.deadline,
        }),
      requests: decide,
      host,
    }),
  })
}
