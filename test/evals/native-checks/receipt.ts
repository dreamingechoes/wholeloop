// Writes a probe run's receipt and a short handoff the maintainer can paste back; neither keeps
// native output, prompts, transcripts or credentials.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Client, ProbePlan } from './plan.js'

export interface ProbeOutcome {
  id: ProbePlan['id']
  tasks: string[]
  cost: ProbePlan['cost']
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'BLOCKED' | 'UNRUN' | 'OBSERVED'
  reasons: string[]
  details?: Record<string, unknown>
}
export interface Receipt {
  schema: 'wholeloop/native-check@1'
  client: Client
  binary: string
  version: string | null
  platform: { os: string; arch: string; node: string }
  source: string | null
  live: boolean
  started: string
  finished: string
  probes: ProbeOutcome[]
}

export function handoff(receipt: Receipt) {
  const rows = receipt.probes.map(
    (probe) =>
      `| ${probe.id} | ${probe.tasks.join(', ')} | ${probe.status} | ${probe.reasons.join(' ')} |`,
  )
  return [
    `# Native check: ${receipt.client}`,
    '',
    `- Client / version: ${receipt.binary} ${receipt.version ?? 'unobserved'}`,
    `- OS / architecture / Node: ${receipt.platform.os} ${receipt.platform.arch} / ${receipt.platform.node}`,
    `- wholeloop source: ${receipt.source ?? 'unknown'}`,
    `- Mode: ${receipt.live ? 'live (models called)' : 'plan only (no model called)'}`,
    `- Started: ${receipt.started}`,
    '',
    '| Probe | Feeds | Result | Why |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    'A probe result is evidence for review, not a closed criterion. The receipt next to this file holds the structured fields; it contains no native output.',
    '',
  ].join('\n')
}

export function writeReceipt(directory: string, receipt: Receipt) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(join(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  })
  writeFileSync(join(directory, 'handoff.md'), handoff(receipt), { mode: 0o600 })
}
