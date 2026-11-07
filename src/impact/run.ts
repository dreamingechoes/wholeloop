// Runs one read-only analyst per source with the queries the core supplies.
import type { ProviderHost } from '../providers/operations.js'
import type { ImpactLayout } from './contracts.js'
import type { impactReport } from './report.js'
import type { ImpactWorkflow } from './workflow.js'

export interface AnalystHost {
  /** One read-only worker per named source; the core supplies all exact queries. */
  source(provider: string): Promise<ProviderHost>
  layout(
    context: ReturnType<ImpactWorkflow['context']>,
    report: ReturnType<typeof impactReport>,
  ): Promise<ImpactLayout[]>
  stopped(): boolean
}
export async function runImpact(
  workflow: ImpactWorkflow,
  options: Parameters<ImpactWorkflow['begin']>[0],
  host: AnalystHost,
) {
  if (host.stopped()) return { status: 'stopped', subject: options.subject ?? null }
  const begun = workflow.begin(options)
  if (begun.status !== 'planned') return begun
  if (host.stopped()) return { status: 'stopped', subject: begun.subject }
  const workers = new Map<string, Promise<ProviderHost>>()
  const reader: ProviderHost = {
    invoke: async (call) => {
      if (!call.operation.startsWith('source.'))
        throw new Error('An impact analyst receives source reads only')
      let worker = workers.get(call.provider)
      if (!worker) {
        worker = host.source(call.provider)
        workers.set(call.provider, worker)
      }
      return (await worker).invoke(call)
    },
  }
  const report = await workflow.observe(begun.subject, reader)
  if (host.stopped()) return { status: 'stopped', subject: begun.subject, report }
  const sections = await host.layout(workflow.context(begun.subject), report)
  if (host.stopped()) return { status: 'stopped', subject: begun.subject, report }
  workflow.format(begun.subject, sections)
  return {
    status: 'completed',
    subject: begun.subject,
    report: workflow.report(begun.subject),
    receipt: workflow.complete(begun.subject),
  }
}
