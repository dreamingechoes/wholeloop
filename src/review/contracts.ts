import { validate } from '../config/schema.js'
import type { GateResult } from '../gates/contracts.js'
import schema from './schemas/input-v1.json' with { type: 'json' }
import type { SnapshotFile } from './snapshots.js'

export interface ReviewInput {
  run: string
  round: number
  before: string
  after: string
  objects: string
  files: SnapshotFile[]
  diffDigest: string
  rubric: { ref: string; origin: string; digest: string }
}
export interface ReviewContext {
  input: ReviewInput
  diff: string
  rubric: ReviewInput['rubric'] & { content: string }
  current: boolean
  previousFindings: { unit: string; finding: GateResult['findings'][number] }[]
}
export type ReviewEventData = { type: 'review.input'; data: ReviewInput }
export function validReviewData(type: string, data: Record<string, unknown>): boolean {
  if (type !== 'review.input' || validate(data, schema).length) return false
  const value = data as unknown as ReviewInput
  return (
    new Set(value.files.map((file) => file.path)).size === value.files.length &&
    value.files.every(
      (file) =>
        !file.path.startsWith('/') &&
        !file.path.split('/').includes('..') &&
        (file.exists
          ? !!file.mode && !!file.oid
          : file.mode === undefined && file.oid === undefined),
    )
  )
}
