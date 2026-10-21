import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadExtensionOptions } from '../config/load.js'
import { FlowEngine } from '../flow/engine.js'
import { dispatchLaunchArtifact } from '../launch/publish.js'
import { LaunchWorkflow } from '../launch/workflow.js'
import { grafanaDashboardHost, grafanaDashboardPlan } from '../providers/grafana-dashboard.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { performOperation } from '../providers/operations.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'

/** The preview creates no dispatch intent and never resolves a credential. */
export async function launchDispatchCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (
    positional.length ||
    typeof options['--for'] !== 'string' ||
    typeof options['--key'] !== 'string' ||
    typeof options['--bridge'] !== 'string'
  )
    throw new CliError(
      'Use launch dispatch --for <id> --key <artifact-key> --bridge <file> [--live]',
    )
  let config: unknown
  try {
    const file = resolve(root, options['--bridge']),
      stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error()
    const bytes = readFileSync(file)
    if (bytes.length > 65536) throw new Error()
    config = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new CliError(
      'Provide one regular non-secret dashboard bridge JSON file under 64 KiB; contents omitted',
    )
  }
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
  let plan: ReturnType<typeof grafanaDashboardPlan> | undefined
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
      invoke: async (call) => {
        plan = grafanaDashboardPlan(config, call)
        return { status: 'pending', ref: target.path }
      },
    },
  )
  if (!plan) throw new CliError('Dashboard bridge did not produce a validated preview')
  const result =
    options['--live'] === true
      ? await dispatchLaunchArtifact(
          workflow,
          subject,
          key,
          grafanaDashboardHost(config, { secret: (name) => process.env[name] }),
        )
      : undefined
  io.out(
    JSON.stringify(
      {
        schema: 'wholeloop/dashboard-dispatch@1',
        subject,
        key,
        status: result ? 'dispatched' : 'planned',
        plan,
        effects: result ? 'explicit-dispatch' : 'not-performed',
        ...(result ? { result } : {}),
      },
      null,
      json ? undefined : 2,
    ),
  )
  return 0
}
