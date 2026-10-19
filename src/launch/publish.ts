import { loadExtensionOptions } from '../config/load.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import type { ProviderHost } from '../providers/operations.js'
import { performOperation } from '../providers/operations.js'
import type { StateEvent } from '../state/events.js'
import { launchArtifacts } from './artifacts.js'
import { measurementDigest } from './measurement.js'
import type { LaunchWorkflow } from './workflow.js'

export function launchDeliveries(events: readonly StateEvent[]) {
  const deliveries = new Map<
    string,
    {
      subject: string
      run: string
      key: string
      provider: string
      operation: string
      bodyDigest: string
      result?: { status: 'succeeded' | 'pending'; ref: string }
    }
  >()
  for (const [index, event] of events.entries()) {
    if (event.type === 'launch.dispatch-planned') {
      const id = `${event.data.run}/${event.data.key}`
      const prior = events.slice(0, index)
      const artifact = launchArtifacts(prior, event.subject, event.data.run).find(
        (artifact) => artifact.key === event.data.key,
      )
      const completed = prior.some(
        (entry) =>
          entry.subject === event.subject &&
          entry.type === 'step.completed' &&
          entry.data.step === 'prepare-launch' &&
          entry.data.run === event.data.run,
      )
      if (
        deliveries.has(id) ||
        !artifact ||
        !completed ||
        event.data.operation !== artifact.operation ||
        measurementDigest(artifact.body) !== event.data.bodyDigest
      )
        throw new Error('Launch dispatch needs one completed artifact and its exact operation/body')
      deliveries.set(id, { subject: event.subject, ...event.data })
    }
    if (event.type === 'launch.dispatch-finished') {
      const entry = deliveries.get(`${event.data.run}/${event.data.key}`)
      if (!entry || entry.subject !== event.subject || entry.result)
        throw new Error('Launch dispatch receipt needs one prior matching intent')
      entry.result = event.data.result
    }
  }
  return [...deliveries.values()]
}
/** The conductor, not the drafting agent, explicitly invokes these three allowed operations. */
export async function dispatchLaunchArtifact(
  workflow: LaunchWorkflow,
  subject: string,
  key: string,
  host: ProviderHost,
) {
  const context = workflow.context(subject)
  const existing = launchDeliveries(workflow.engine.store.events()).find(
    (entry) => entry.subject === subject && entry.run === context.plan.run && entry.key === key,
  )
  if (existing?.result)
    return {
      schema: 'wholeloop/launch-dispatch-result@1',
      subject,
      key,
      cached: true,
      result: existing.result,
    }
  if (existing)
    throw new Error(
      'Launch publication outcome is ambiguous; inspect the retained intent before another write',
    )
  const target = workflow.publication(subject).find((target) => target.key === key)
  if (!target) throw new Error('Unknown launch artifact key')
  if (target.status === 'stored' || target.status === 'handoff')
    return {
      schema: 'wholeloop/launch-dispatch-result@1',
      subject,
      key,
      cached: true,
      result: { status: target.status, ref: target.path },
    }
  const registry = loadProviders(
    loadExtensionOptions({ root: workflow.engine.root, userFile: workflow.engine.userFile }),
  )
  const provider = resolveProvider(registry, target.operation, target.provider)
  workflow.engine.store.transaction((_events, append) =>
    append(subject, {
      type: 'launch.dispatch-planned',
      data: {
        run: context.plan.run,
        key,
        provider: target.provider,
        operation: target.operation,
        bodyDigest: measurementDigest(target.body),
      },
    }),
  )
  let result: Awaited<ReturnType<typeof performOperation>>
  try {
    result = await performOperation(
      provider,
      target.operation,
      {
        title: target.title,
        body: target.body,
        artifact: target.path,
        ...(target.operation === 'comms.draft' ? { draft: true, send: false } : {}),
        ...(target.metricRef
          ? { measurementEntry: target.metricRef, dashboard: JSON.parse(target.body) as unknown }
          : {}),
      },
      host,
    )
  } catch {
    throw new Error(
      'Launch publication failed; inspect its retained intent and remote state before retrying',
    )
  }
  if (target.operation === 'comms.draft' && result.status === 'succeeded') {
    let observed: unknown
    try {
      observed = JSON.parse(result.body ?? '')
    } catch {
      throw new Error(
        'Comms draft requires an explicit unsent draft observation; inspect remote state',
      )
    }
    if (
      !observed ||
      typeof observed !== 'object' ||
      !('draft' in observed) ||
      observed.draft !== true ||
      !('sent' in observed) ||
      observed.sent !== false
    )
      throw new Error('Comms result does not establish an unsent draft; inspect remote state')
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(result.ref)) {
    const url = new URL(result.ref)
    if (url.username || url.password || url.search)
      throw new Error(
        'Provider reference contains credentials or query data; inspect the remote result',
      )
  }
  const receipt = { status: result.status, ref: result.ref }
  workflow.engine.store.transaction((_events, append) => {
    append(subject, {
      type: 'launch.dispatch-finished',
      data: { run: context.plan.run, key, result: receipt },
    })
    if (/^https?:\/\//.test(receipt.ref))
      append(subject, { type: 'link.added', data: { url: receipt.ref } })
  })
  return {
    schema: 'wholeloop/launch-dispatch-result@1',
    subject,
    key,
    cached: false,
    result: receipt,
  }
}
