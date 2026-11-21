// Gives a fresh worker only its pinned question, allowed source and response contract.

import type { Schema } from '../config/schema.js'

export interface WorkerAssignment {
  role: string
  subject: string
  run: string
  question: string
  allowedSource: Record<string, unknown>
  input: Record<string, unknown>
  resultSchema: Schema
}

export function workerAssignment<T extends WorkerAssignment>(
  assignment: T,
  identity: Record<string, string | number> = {},
) {
  const snapshot = structuredClone(assignment)
  const { $id: resultContract, ...schema } = snapshot.resultSchema as Schema & { $id?: string }
  if (!resultContract || !/^wholeloop\/[a-z][a-z0-9-]*@[1-9][0-9]*$/.test(resultContract))
    throw new Error('A worker needs a versioned result contract')
  for (const [key, value] of Object.entries(identity)) {
    const rule = schema.properties?.[key]
    if (!rule || !schema.properties)
      throw new Error('Response identity is absent from its contract')
    schema.properties[key] = { ...rule, const: value }
  }
  // A job-local refinement must not redefine the public contract under its original identity.
  return {
    ...snapshot,
    resultContract,
    resultSchema: schema,
    returnTo: { role: 'conductor', channel: 'final-message' } as const,
  }
}
