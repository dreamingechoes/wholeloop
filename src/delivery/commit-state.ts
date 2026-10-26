import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import type { CandidateFiles } from './candidate-files.js'
import { deliveryEffects } from './effect-events.js'
import { readSourceFile } from './input.js'
import type { DeliveryLifecycle } from './lifecycle.js'
import { validateDeliveryShape } from './plan.js'
import receiptSchema from './schemas/commit-receipt-v1.json' with { type: 'json' }
import recordSchema from './schemas/commit-record-v1.json' with { type: 'json' }
import requestSchema from './schemas/commit-request-v1.json' with { type: 'json' }
import statusSchema from './schemas/commit-status-v1.json' with { type: 'json' }
import type { DeliveryWorkspaceRecord } from './workspaces.js'

export const CANDIDATE_COMMIT_SCHEMAS = {
  request: requestSchema,
  record: recordSchema,
  receipt: receiptSchema,
  status: statusSchema,
}
export interface CandidateCommitRequest {
  schema: 'wholeloop/delivery-commit-request@1'
  workspace: string
  key: string
  head: string
  snapshot: string
  message: string
}
export interface CandidateCommitRecord {
  schema: 'wholeloop/delivery-commit-record@1'
  digest: string
  request: CandidateCommitRequest
  run: string
  plan: string
  source: string
  grant: string
  grantDigest: string
  files: CandidateFiles
}
export interface CandidateCommitReceipt {
  schema: 'wholeloop/delivery-commit-receipt@1'
  digest: string
  record: string
  workspace: string
  run: string
  plan: string
  grantDigest: string
  parent: string
  head: string
  files: string
  index: string
  effects: { stage: string; commit: string }
}
export class CandidateCommitError extends Error {
  constructor(readonly problem: string) {
    super(`Delivery commit refused: ${problem}; contents omitted`)
  }
}
function digest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new CandidateCommitError('digest')
  return value
}
export const commitRecordPath = (value: string) => `delivery/commits/${digest(value)}/record.json`
export const commitReceiptPath = (value: string) => `delivery/commit-receipts/${digest(value)}.json`
export const workspaceCommitPath = (value: string) =>
  `delivery/workspace-heads/${digest(value)}.txt`
export const candidateCommitKey = (value: string, step: 'stage' | 'commit') =>
  `candidate-${digest(value)}-${step}`

export function readCandidateCommit(
  lifecycle: DeliveryLifecycle,
  value: string,
): CandidateCommitRecord {
  const record = JSON.parse(
    readSourceFile(lifecycle.journal.files.root, commitRecordPath(value), 2 * 1024 * 1024),
  ) as CandidateCommitRecord
  validateDeliveryShape(record, recordSchema)
  const { schema: _schema, digest: actual, ...binding } = record
  if (actual !== value || contractDigest(binding) !== value)
    throw new CandidateCommitError('record-binding')
  return record
}
export function readCommitReceipt(
  lifecycle: DeliveryLifecycle,
  value: string,
): CandidateCommitReceipt {
  const receipt = JSON.parse(
    readSourceFile(lifecycle.journal.files.root, commitReceiptPath(value), 65536),
  ) as CandidateCommitReceipt
  validateDeliveryShape(receipt, receiptSchema)
  const { schema: _schema, digest: actual, ...binding } = receipt
  if (actual !== value || contractDigest(binding) !== value)
    throw new CandidateCommitError('receipt-binding')
  return receipt
}

/** The actual effect journal fences old locators; a private pointer alone never establishes a committed head. */
export function workspaceCommitEffects(
  lifecycle: DeliveryLifecycle,
  workspace: DeliveryWorkspaceRecord,
) {
  const state = lifecycle.journal.get(workspace.request.run)
  return deliveryEffects(state).records.filter(
    (effect) =>
      effect.intent.basis === workspace.request.plan &&
      effect.intent.ref === workspace.repository.branch &&
      effect.intent.repository === workspace.repository.repository &&
      /^candidate-[a-f0-9]{64}-(stage|commit)$/.test(effect.intent.key),
  )
}
export function validateWorkspaceCommit(
  lifecycle: DeliveryLifecycle,
  workspace: DeliveryWorkspaceRecord,
  receipt: CandidateCommitReceipt,
): void {
  validateDeliveryShape(receipt, receiptSchema)
  const { schema: _schema, digest: actual, ...binding } = receipt
  if (actual !== contractDigest(binding)) throw new CandidateCommitError('receipt-binding')
  const state = lifecycle.journal.get(workspace.request.run),
    records = workspaceCommitEffects(lifecycle, workspace),
    latest = records
      .filter((effect) => effect.intent.operation === 'git.commit' && effect.status === 'applied')
      .sort((a, b) => b.sequence - a.sequence)[0],
    authority = lifecycle.authority.inspect(workspace.grant)
  if (
    !latest ||
    records.some((effect) => ['prepared', 'pending', 'unknown'].includes(effect.status))
  )
    throw new CandidateCommitError('unresolved-original-effect')
  if (
    authority.status !== 'active' ||
    authority.digest !== workspace.grantDigest ||
    state.grant?.id !== workspace.grant ||
    state.grant.digest !== authority.digest ||
    state.basis.digest !== workspace.request.plan
  )
    throw new CandidateCommitError('inactive-head-authority')
  const record = readCandidateCommit(lifecycle, receipt.record)
  if (
    receipt.effects.commit !== latest.intent.id ||
    receipt.workspace !== workspace.digest ||
    receipt.run !== workspace.request.run ||
    receipt.plan !== workspace.request.plan ||
    receipt.grantDigest !== workspace.grantDigest ||
    record.request.workspace !== workspace.digest ||
    record.run !== receipt.run ||
    record.plan !== receipt.plan ||
    record.source !== workspace.source ||
    record.grant !== workspace.grant ||
    record.grantDigest !== receipt.grantDigest ||
    record.request.head !== receipt.parent ||
    record.files.digest !== receipt.files ||
    record.files.index !== receipt.index
  )
    throw new CandidateCommitError('head-receipt-binding')
  for (const step of ['stage', 'commit'] as const) {
    const effect = records.find((entry) => entry.intent.id === receipt.effects[step]),
      observation = effect?.observations.at(-1)
    if (
      effect?.status !== 'applied' ||
      effect.admission?.provenance !== 'host-observed' ||
      effect.intent.key !== candidateCommitKey(record.digest, step) ||
      effect.intent.operation !== (step === 'stage' ? 'code.write' : 'git.commit') ||
      effect.intent.grantDigest !== workspace.grantDigest ||
      effect.intent.expectedHead !== receipt.parent ||
      effect.intent.inputDigest !== contractDigest({ record: record.digest, step }) ||
      observation?.provenance !== 'host-observed' ||
      observation.status !== 'applied' ||
      observation.invocationState !== 'stopped' ||
      observation.resource?.ref !== workspace.repository.branch ||
      observation.resource.revision !== (step === 'stage' ? receipt.index : receipt.head)
    )
      throw new CandidateCommitError('head-native-evidence')
  }
}
export function currentWorkspaceCommit(
  lifecycle: DeliveryLifecycle,
  workspace: DeliveryWorkspaceRecord,
): CandidateCommitReceipt | undefined {
  const records = workspaceCommitEffects(lifecycle, workspace),
    files = lifecycle.journal.files,
    path = workspaceCommitPath(workspace.digest)
  if (records.some((effect) => ['prepared', 'pending', 'unknown'].includes(effect.status)))
    throw new CandidateCommitError('unresolved-original-effect')
  const latest = records
    .filter((effect) => effect.intent.operation === 'git.commit' && effect.status === 'applied')
    .sort((a, b) => b.sequence - a.sequence)[0]
  if (!latest && !existsSync(files.path(path))) return undefined
  if (!latest || !existsSync(files.path(path)))
    throw new CandidateCommitError('head-locator-unavailable')
  const receipt = readCommitReceipt(lifecycle, readSourceFile(files.root, path, 128).trim())
  validateWorkspaceCommit(lifecycle, workspace, receipt)
  return receipt
}
