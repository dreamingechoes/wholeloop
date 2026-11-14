// The response schema given to native structured output, which the core still validates in full.
import type { Schema } from '../config/schema.js'
import { GATE_SCHEMAS } from '../gates/contracts.js'

/** Native generation supports a subset; the unchanged core validator still enforces all constraints. */
export function generationSchema(rule: Schema): Schema {
  if (rule.type === 'object') {
    const properties = Object.fromEntries(
      Object.entries(rule.properties ?? {}).map(([key, child]) => [key, generationSchema(child)]),
    )
    return {
      type: 'object',
      properties,
      additionalProperties: false,
      required: Object.keys(properties),
    }
  }
  if (rule.type === 'array') {
    if (!rule.items) throw new Error('Native generation requires explicit array items')
    return {
      type: 'array',
      items: generationSchema(rule.items),
      // Preserve an explicit role prohibition without importing every public
      // array bound into the native subset. The core still validates all output.
      ...((rule as Schema & { maxItems?: number }).maxItems === 0 ? { maxItems: 0 } : {}),
    }
  }
  return {
    type: rule.type,
    ...(rule.enum ? { enum: [...rule.enum] } : {}),
    // Native structured output drops pattern, but the core refuses a value that
    // misses it after an expensive call; a live Codex builder named an artifact
    // outside artifacts/ for that reason. The rule travels as a description.
    ...(rule.pattern ? { description: `Must match the regular expression ${rule.pattern}` } : {}),
  }
}

/** Never reconstruct missing response identity after a model returns an unbound inner result. */
export function headlessResponseSchema(
  identity: { assignment: string; run: string; round: number },
  role: 'inspect' | 'refute',
  assignment: Record<string, unknown>,
): Schema {
  if (
    !/^[a-f0-9]{64}$/.test(identity.assignment) ||
    !/^gate-[a-f0-9]{16}$/.test(identity.run) ||
    !Number.isInteger(identity.round) ||
    identity.round < 1 ||
    !['inspect', 'refute'].includes(role)
  )
    throw new Error('Native response schema requires the exact current gate identity')
  const field = role === 'inspect' ? 'result' : 'vote'
  const source: Schema = structuredClone(
    role === 'inspect' ? GATE_SCHEMAS.result : GATE_SCHEMAS.vote,
  )
  // Read-only workers never execute the suite. Optional reason becomes required
  // in the native subset; both a completed inspection and an unavailable one can explain it.
  if (source.properties) delete source.properties.execution
  const payload = generationSchema(source)
  if (role === 'inspect') {
    if (
      typeof assignment.id !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(assignment.id) ||
      assignment.id === 'suite'
    )
      throw new Error('Native inspection requires an explicit non-suite unit')
    if (payload.properties) payload.properties.unit = { type: 'string', enum: [assignment.id] }
  } else {
    if (
      typeof assignment.finding !== 'string' ||
      !/^[^:]+:[^:]+$/.test(assignment.finding) ||
      !Number.isInteger(assignment.verifier) ||
      Number(assignment.verifier) < 1 ||
      Number(assignment.verifier) > 9
    )
      throw new Error('Native refutation requires an exact finding and verifier')
    if (payload.properties) {
      payload.properties.finding = { type: 'string', enum: [assignment.finding] }
      payload.properties.verifier = { type: 'integer', enum: [assignment.verifier] }
    }
  }
  return {
    type: 'object',
    properties: {
      schema: { type: 'string', enum: ['wholeloop/headless-result@1'] },
      assignment: { type: 'string', enum: [identity.assignment] },
      run: { type: 'string', enum: [identity.run] },
      round: { type: 'integer', enum: [identity.round] },
      [field]: payload,
    },
    required: ['schema', 'assignment', 'run', 'round', field],
    additionalProperties: false,
  }
}
