import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { dirname } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import type { NativeBoundaryHost } from '../delivery/native-assignment-host.js'
import type { NativeBinding, NativeBindings } from '../delivery/native-bindings.js'
import { ClaudeBoundaryHost } from '../delivery/native-claude-boundary.js'
import { CodexBoundaryHost } from '../delivery/native-codex-boundary.js'
import type { NativeProcessRunner, NativeRunOptions } from '../delivery/native-host.js'
import { NativePurposeAttempts } from '../delivery/native-purpose.js'
import { type NativeRuntime, nativeRuntimeClient } from '../delivery/native-runtime.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { DeliveryQueue } from '../delivery/queue.js'
import { DeliverySources } from '../delivery/source.js'
import type { WorkerAssignment, WorkerContext, WorkerRole } from '../delivery/worker-protocol.js'
import { canonicalPath } from '../state/paths.js'
import { gitBytes } from '../worktrees/git.js'
import { RunnerAcceptanceDefinitionStages } from './acceptance-definition-stages.js'
import type { RunnerArtifactInput } from './artifact-attempts.js'
import { RunnerBuilderPlanningStages } from './builder-planning-stages.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerPlanStages } from './plan-stages.js'
import type { PublicHostComposer } from './public-host.js'
import { RunnerResearchStages } from './research-stages.js'
import { NativeResearchWorkers, RunnerResearchAttempts } from './research-workers.js'
import { DeliveryRunnerError, runnerDecisionRequirements } from './route.js'
import { RunnerStageDispatcher } from './stage-dispatcher.js'
import type { RunnerStore } from './store.js'
import { RunnerWorkerStages } from './worker-stages.js'

/** Routes the public host composes so far; every other route stays unsupported. */
const COMPOSED = ['research-report', 'to-pr']
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
export function publicNativeParts(
  store: RunnerStore,
  binding: Readonly<NativeBinding>,
  runtime: Readonly<NativeRuntime>,
  output?: 'files' | 'inline-proposal',
):
  | {
      base: Omit<NativeRunOptions, 'process' | 'host' | 'prepared' | 'signal'>
      /** The fixed observer for this target, regenerating the recipe for `workspace`. */
      observer(process: NativeProcessRunner, workspace?: string): NativeBoundaryHost
    }
  | undefined {
  const entry = nativeRuntimeClient(runtime, binding.target)
  if (!entry) return undefined
  const model = { target: binding.target, version: binding.version, model: binding.model }
  if (binding.target === 'codex') {
    const path = `${dirname(entry.client)}:${dirname(process.execPath)}:/usr/bin:/bin`
    return {
      base: { ...model, path, nativeStore: entry.store, ...(output ? { output } : {}) },
      observer: (runner, workspace) =>
        new CodexBoundaryHost(store.files, {
          path,
          nativeStore: entry.store,
          ...(workspace ? { workspace } : {}),
          ...(output ? { output } : {}),
          provenance: 'host-observed',
          process: runner,
          current: () => true,
        }),
    }
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
  return {
    base: {
      ...model,
      path: '/usr/bin:/bin',
      nativeStore: containment.store,
      containment,
      ...(output ? { output } : {}),
    },
    observer: (runner, workspace) =>
      new ClaudeBoundaryHost(store.files, {
        path: '/usr/bin:/bin',
        containment,
        ...(workspace ? { workspace } : {}),
        ...(output ? { output } : {}),
        provenance: 'host-observed',
        process: runner,
        current: () => true,
      }),
  }
}

/** Native options for one bound client with no workspace, as read-only attempts launch. */
export function publicNativeOptions(
  store: RunnerStore,
  binding: Readonly<NativeBinding>,
  runtime: Readonly<NativeRuntime>,
  output?: 'files' | 'inline-proposal',
): ((process: NativeProcessRunner) => NativeRunOptions) | undefined {
  const parts = publicNativeParts(store, binding, runtime, output)
  if (!parts) return undefined
  return (runner) => ({ ...parts.base, process: runner, host: parts.observer(runner) })
}

/**
 * The plan's pinned guidance as worker context. A pin names a file in one of
 * the plan's repositories; its bytes are read from the repository's pinned
 * base commit and must match the pinned digest, so a moved branch or edited
 * file cannot change what a worker is told. Anything else is unsupported.
 */
function guidanceContext(store: RunnerStore, plan: Readonly<DeliveryPlan>) {
  const root = `delivery/public-guidance/${contractDigest(plan.guidance)}`,
    context: WorkerContext[] = []
  for (const [index, pin] of plan.guidance.entries()) {
    const repository = plan.repositories.find((entry) => entry.id === pin.repository)
    if (!repository) return undefined
    let bytes: Buffer
    try {
      bytes = gitBytes(repository.root, ['show', `${repository.base}:${pin.ref}`])
    } catch {
      return undefined
    }
    if (
      createHash('sha256').update(bytes).digest('hex') !== pin.sha256 ||
      bytes.length > 256 * 1024
    )
      return undefined
    const ref = `artifacts/guidance-${index}.txt`
    if (!existsSync(store.files.path(`${root}/${ref}`))) store.files.atomic(`${root}/${ref}`, bytes)
    context.push({
      kind: 'guidance',
      audience: 'shared',
      artifact: { ref, bytes: bytes.length, sha256: pin.sha256 },
    })
  }
  return { contextRoot: store.files.path(root), context }
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
export const composePublicHost: PublicHostComposer = (input) => {
  const { store, request, plan, configuration } = input
  if (!COMPOSED.includes(plan.policy.endpoint)) return undefined
  if (plan.policy.endpoint === 'to-pr') return composeImplementation(input)
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

/**
 * The to-pr route (ADR-0207). Composed so far: plan, acceptance definition,
 * workspace, build plan, implementation and commit. Every later stage has no
 * adapter yet, so the dispatcher reports the route unsupported before any
 * dispatch; nothing runs half a route.
 */
const composeImplementation: PublicHostComposer = ({ store, request, plan, configuration }) => {
  const { bindings, runtime } = configuration,
    judges = bindingFor(bindings, ['planner', 'challenger']),
    builders = bindingFor(bindings, ['builder']),
    judging = judges && publicNativeOptions(store, judges, runtime, 'inline-proposal'),
    // A builder edits its workspace directly; its proposal stays inline.
    building = builders && publicNativeParts(store, builders, runtime, 'inline-proposal'),
    guidance = guidanceContext(store, plan)
  if (!judging || !building || !guidance) return undefined
  const environment: WorkerAssignment['environment'] = {
      id: 'public-native-delivery',
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
    decide = requests(store),
    artifact = (): RunnerArtifactInput => ({
      // The adapter writes the brief from the pinned plan and source.
      brief: '',
      environment,
      ...guidance,
      provenance: 'host-observed',
    }),
    production = { identity: request.host, native: judging, context: artifact },
    // A queued builder is admitted only for a role some binding allows.
    admitted = contractDigest({ bindings, runtime })
  return new RunnerStageDispatcher(store, request.host, {
    plan: new RunnerPlanStages(store, { identity: request.host, requests: decide, host }),
    'acceptance-definition': new RunnerAcceptanceDefinitionStages(store, production),
    git: new RunnerGitStages(store),
    'build-plan': new RunnerBuilderPlanningStages(store, {
      production,
      decision: (context, produced) => {
        if (!produced.artifact) throw new DeliveryRunnerError('public-build-plan-artifact-required')
        const [first] = decide(context, produced.artifact)
        if (!first) throw new DeliveryRunnerError('public-build-plan-decision-required')
        return first
      },
      host,
    }),
    implementation: new RunnerWorkerStages(store, queue(), {
      identity: request.host,
      native: building.base,
      boundary: (process, workspace) => building.observer(process, workspace),
      context: (_context, workspace) => ({
        ...(workspace ? { workspace } : {}),
        environment,
        ...guidance,
      }),
      admit: (candidate) =>
        bindings.bindings.some((binding) => binding.roles.includes(candidate.entry.role))
          ? { ready: true, provenance: 'host-observed', evidence: admitted }
          : { ready: false, reason: 'capability-unavailable' },
    }),
  })
}
