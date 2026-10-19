import { normalizedReadHost, planReadRequests } from '../providers/reads.js'
import { collectImpact } from './evidence.js'
import type { ImpactWorkflow } from './workflow.js'

export async function impactReadRequests(workflow: ImpactWorkflow, subject: string) {
  const { record, registry, owner } = workflow.context(subject)
  const requests = await planReadRequests((host) =>
    collectImpact(record.plan, registry, owner, host),
  )
  return {
    schema: 'wholeloop/impact-read-requests@1',
    subject,
    run: record.plan.run,
    at: record.plan.at,
    requests,
    performed: false,
  }
}
export function impactResponseHost(
  value: unknown,
  requests: Awaited<ReturnType<typeof impactReadRequests>>,
) {
  return normalizedReadHost(
    value,
    { schema: 'wholeloop/impact-read-responses@1', run: requests.run, at: requests.at },
    requests.requests,
  )
}
