import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import type { RunnerStore } from '../../../src/runner/store.js'

/** Read retained receipts even when the CLI failed to return valid JSON. */
export function trialObservations(store: RunnerStore, run: string) {
  const state = store.files.root
  const report: Record<string, unknown> = {}
  report.humanWaits = store.lifecycle.journal
    .events()
    .filter((event) => event.run === run && 'to' in event && event.to === 'waiting-input').length
  const receipts: Record<string, unknown>[] = []
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.startsWith('receipt-') && entry.name.endsWith('.json'))
        receipts.push(JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>)
    }
  }
  // A preflight refusal legitimately has no native receipt directory.
  const native = join(state, 'delivery', 'native')
  if (existsSync(native)) walk(native)
  report.native = receipts.map((receipt) => ({
    status: receipt.status,
    reason: receipt.reason ?? null,
    version: receipt.version,
    model: receipt.model,
    provenance: (receipt.observation as { provenance?: string } | undefined)?.provenance ?? null,
    usage: receipt.usage ?? null,
  }))
  const usage: Record<string, number | string> = { provenance: 'client-reported', unreported: 0 }
  for (const receipt of receipts) {
    if (!receipt.usage) usage.unreported = Number(usage.unreported) + 1
    else
      for (const key of [
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheCreationTokens',
        'costMicros',
      ])
        usage[key] =
          Number(usage[key] ?? 0) + Number((receipt.usage as Record<string, number>)[key] ?? 0)
  }
  report.usage = usage
  report.effects = new DeliveryEffects(state).inspect(run).map((record) => ({
    operation: record.intent.operation,
    ref: record.intent.ref,
    expectedHead: record.intent.expectedHead ?? null,
    status: record.status,
    observations: record.observations,
  }))
  const cases: Record<string, unknown>[] = []
  const readCases = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) readCases(full)
      else if (entry.name === 'result.json') {
        const result = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>
        cases.push({
          case: result.case,
          key: result.key,
          status: result.status,
          reason: result.reason,
          host: result.host,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
        })
      }
    }
  }
  const caseRoot = join(state, 'delivery', 'acceptance-cases')
  if (existsSync(caseRoot)) readCases(caseRoot)
  report.cases = cases
  return report
}
