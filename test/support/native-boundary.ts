import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { nativeDeliveryRecipe } from '../../src/delivery/native-adapters.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../src/delivery/plan.js'
import { createWorkerAssignment, type WorkerRole } from '../../src/delivery/worker-protocol.js'
import type { StoreFiles } from '../../src/state/files.js'

export function nativeBoundaryInput(
  files: StoreFiles,
  parent: string,
  role: WorkerRole = 'planner',
  workspace?: string,
  output: 'files' | 'inline-proposal' = 'inline-proposal',
) {
  const assignment = createWorkerAssignment({
      identity: {
        run: 'delivery-0123456789abcdef',
        plan: 'a'.repeat(64),
        revision: role === 'planner' ? 0 : 1,
        role,
        attempt: `attempt-${randomBytes(8).toString('hex')}`,
        generation: 1,
        ...(role === 'planner' ? {} : { unit: 'contract' }),
      },
      grantDigest: 'b'.repeat(64),
      source: 'c'.repeat(64),
      brief: 'Exercise public model-free permission witnesses only.',
      endpoint: 'local-handoff',
      intervention: 'none',
      environment: { id: 'control', recipe: 'd'.repeat(64), boundary: 'e'.repeat(64) },
      candidates: [],
      criteria: [],
      findings: [],
      contracts: [],
      context: [],
      deadline: new Date(Date.now() + 30000).toISOString(),
      limits: { ...DEFAULT_DELIVERY_BUDGETS },
    }),
    directory = files.path(
      `delivery/native/${assignment.identity.run}/${assignment.identity.attempt}/${randomUUID()}`,
    ),
    nativeStore = join(parent, 'empty-native-store')
  mkdirSync(nativeStore, { recursive: true, mode: 0o700 })
  const selected = nativeDeliveryRecipe({
    target: 'codex',
    version: '0.163.0',
    assignment,
    directory,
    model: 'model-not-invoked',
    output,
    ...(workspace ? { workspace } : {}),
  })
  if (!selected.available) throw new Error('Fixture reference recipe unavailable')
  const { response: _response, ...recipe } = selected.recipe
  return { input: { assignment, recipe, model: 'model-not-invoked' }, nativeStore }
}
