// `wl launch dispatch`: plans one metric-pinned dashboard creation without performing it
// (ADR-0085).
import { loadExtensionOptions } from '../config/load.js'
import { FlowEngine } from '../flow/engine.js'
import { LaunchWorkflow } from '../launch/workflow.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { type OperationCall, performOperation } from '../providers/operations.js'
import { planProviderTransport } from '../providers/transport.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
import { readClientInventory } from './mcp-inventory.js'

/**
 * Plan one metric-pinned dashboard creation without performing it (ADR-0085).
 *
 * With a reviewed binding in the client's MCP inventory the output is the
 * exact call the client makes; the conductor SDK's dispatchLaunchArtifact
 * journals the intent and receipt around it. Without one, the dashboard stays
 * the local pending handoff. This command writes no state and reads no
 * credential on either route.
 */
export async function launchDispatchCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (
    positional.length ||
    typeof options['--for'] !== 'string' ||
    typeof options['--key'] !== 'string'
  )
    throw new CliError('Use launch dispatch --for <id> --key <artifact-key> [--mcp <file>]')
  const inventory =
    typeof options['--mcp'] === 'string' ? readClientInventory(root, options['--mcp']) : undefined
  const workflow = new LaunchWorkflow(new FlowEngine(new StateStore(), root))
  const subject = options['--for'],
    key = options['--key']
  const target = workflow.publication(subject).find((target) => target.key === key)
  const context = workflow.context(subject)
  if (
    target?.operation !== 'dashboards.create' ||
    !workflow.engine.store
      .events()
      .some(
        (event) =>
          event.subject === subject &&
          event.type === 'step.completed' &&
          event.data.step === 'prepare-launch' &&
          event.data.run === context.plan.run,
      )
  )
    throw new CliError('Select a dashboard from one completed launch kit')
  const registry = loadProviders(loadExtensionOptions({ root, userFile: workflow.engine.userFile }))
  const provider = resolveProvider(registry, target.operation, target.provider)
  const route = planProviderTransport(provider, target.operation, inventory ? { inventory } : {})
  // The same input dispatchLaunchArtifact sends, so the planned call is the one a host receives.
  let call: OperationCall | undefined
  await performOperation(
    provider,
    target.operation,
    {
      title: target.title,
      body: target.body,
      artifact: target.path,
      measurementEntry: target.metricRef,
      dashboard: JSON.parse(target.body) as unknown,
    },
    {
      invoke: async (planned) => {
        call = planned
        return { status: 'pending', ref: target.path }
      },
    },
  )
  if (!call) throw new CliError('Dashboard dispatch did not produce a validated call')
  const planned = route.transport === 'mcp'
  io.out(
    JSON.stringify(
      {
        schema: 'wholeloop/dashboard-dispatch@2',
        subject,
        key,
        provider: provider.manifest.id,
        operation: target.operation,
        status: planned ? 'planned' : 'handoff',
        transport: route.transport,
        ...(route.server ? { server: route.server } : {}),
        tool: route.tool,
        ...(planned ? { args: call.args } : { handoff: target.path }),
        reason: route.reason,
        effects: 'not-performed',
        authentication: route.authentication,
      },
      null,
      json ? undefined : 2,
    ),
  )
  return 0
}
