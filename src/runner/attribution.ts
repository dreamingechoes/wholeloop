import { validRationale } from '../state/attribution.js'

/** Copy one original judgment verbatim; a changed basis or oversized reason stays unknown. */
export function retainedDecisionRationale(
  records: readonly {
    request: { run: string; plan: string; decision: string }
    judgment: { rationale: string }
  }[],
  run: string,
  plan: string,
  required: readonly string[],
) {
  return records.find(
    (record) =>
      record.request.run === run &&
      record.request.plan === plan &&
      required.includes(record.request.decision) &&
      validRationale({ kind: 'controller' }, record.judgment.rationale, true, true),
  )?.judgment.rationale
}
