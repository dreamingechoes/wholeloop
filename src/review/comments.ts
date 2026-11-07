// Drafts review comments locally and publishes one only through an explicit host call.
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import type { FlowEngine } from '../flow/engine.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { type ProviderHost, performOperation } from '../providers/operations.js'
import { reviewInputs } from './state.js'

/** Drafting is local; only an explicitly requested host call can publish the comment. */
export function reviewCommentPlan(engine: FlowEngine, subject: string, pr: string) {
  const url = new URL(pr)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Use a credential-free HTTPS PR reference')
  const gate = gateRuns(engine.store.events())
    .filter((run) => run.subject === subject && run.gate === 'review')
    .at(-1)
    ?.rounds.at(-1)
  const input = reviewInputs(engine.store.events()).find(
    (entry) =>
      entry.subject === subject &&
      entry.input.run === gate?.plan.run &&
      entry.input.round === gate?.plan.round,
  )
  if (
    !gate?.decision ||
    !input ||
    workspaceSnapshot(gate.plan.repository).digest !== gate.plan.snapshot.digest
  )
    throw new Error('A comment requires a sealed current review with pinned input')
  const providerSettings = engine.config().providers
  const provider = resolveProvider(
    loadProviders(loadExtensionOptions({ root: engine.root, userFile: engine.userFile })),
    'codehost.comment-pr',
    isObject(providerSettings) && typeof providerSettings.codehost === 'string'
      ? providerSettings.codehost
      : undefined,
  )
  const report = gate.decision.report
  const kept = new Set(report.kept.map((entry) => entry.id))
  const findings = gate.results.flatMap((result) =>
    result.findings
      .filter((finding) => kept.has(`${result.unit}:${finding.id}`))
      .map((finding) => `- ${result.unit}: ${finding.location} — ${finding.text}`),
  )
  const body = `Code review: ${report.verdict}, round ${gate.plan.round}/${gate.plan.budget}.\n\n${findings.length ? findings.join('\n') : 'No kept findings.'}\n\n${report.missing.length ? `Missing observations: ${report.missing.join(', ')}.\n\n` : ''}This comment records inspection findings; it does not approve or request changes.\n`
  return {
    schema: 'wholeloop/review-comment-plan@1',
    provider: provider.manifest.id,
    operation: 'codehost.comment-pr',
    input: {
      ref: pr,
      body,
      idempotencyKey: `${gate.plan.run}/${gate.plan.round}/${input.input.diffDigest}`,
    },
    published: false,
  }
}

export async function publishReviewComment(
  engine: FlowEngine,
  subject: string,
  pr: string,
  host: ProviderHost,
  requested: boolean,
) {
  if (!requested) throw new Error('Posting a PR comment requires an explicit request')
  const plan = reviewCommentPlan(engine, subject, pr)
  const provider = resolveProvider(
    loadProviders(loadExtensionOptions({ root: engine.root, userFile: engine.userFile })),
    'codehost.comment-pr',
    plan.provider,
  )
  const result = await performOperation(provider, 'codehost.comment-pr', plan.input, host)
  return { schema: 'wholeloop/review-comment@1', subject, pr, result }
}
