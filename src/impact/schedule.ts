// The checkpoint schedule for impact measurement.
import { isObject } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import { impactRuns } from './contracts.js'

export function checkpointDays(key: string): number | undefined {
  if (key === 'launch') return 0
  const days = /^(?:d\+?)(\d+)$/i.exec(key)?.[1]
  return days === undefined ? undefined : Number(days)
}
export function configuredCheckpoints(config: Record<string, unknown>): string[] {
  const learn = config.learn
  return isObject(learn) && Array.isArray(learn.checkpoints)
    ? (learn.checkpoints as string[])
    : ['launch', 'd7', 'd30']
}
export function impactSchedule(
  events: readonly StateEvent[],
  subject: string,
  keys: string[],
  at = new Date().toISOString(),
) {
  const runs = impactRuns(events).filter((run) => run.subject === subject)
  const record = runs.at(-1)
  if (!record) return undefined
  return {
    schema: 'wholeloop/impact-schedule@1',
    subject,
    checkpoints: keys.map((key) => {
      const days =
        runs.findLast((run) => run.plan.checkpoint === key)?.plan.afterDays ?? checkpointDays(key)
      const due =
        days === undefined
          ? null
          : new Date(Date.parse(record.plan.launchedAt) + days * 86400000).toISOString()
      const measured = runs.some((run) => run.plan.checkpoint === key && run.observation)
      return {
        key,
        due,
        status: measured
          ? 'measured'
          : !due
            ? 'needs-offset'
            : Date.parse(due) <= Date.parse(at)
              ? 'due'
              : 'scheduled',
      }
    }),
  }
}
