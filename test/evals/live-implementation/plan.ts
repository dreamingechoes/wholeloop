import { sourceHash } from '../../../src/delivery/input.js'
import { DEFAULT_DELIVERY_BUDGETS, type DeliveryPlan } from '../../../src/delivery/plan.js'
import type { StoreFiles } from '../../../src/state/files.js'
import { DELEGATED } from '../../support/public-implementation.js'
import { TASK, TRIAL_FILES, TRIAL_REPOSITORY } from './fixture.js'

export function trialPlan(
  files: StoreFiles,
  input: { run: string; source: string; root: string; base: string },
  task = TASK,
): DeliveryPlan {
  return {
    schema: 'wholeloop/delivery-plan@1',
    run: input.run,
    revision: 1,
    source: input.source,
    owner: 'Campaign Owner',
    scope: {
      outcomes: [
        { id: 'status', text: 'Return the required status through the public HTTP endpoint.' },
      ],
      exclusions: ['No dependency, credential, CI change, merge or unrelated feature.'],
    },
    repositories: [
      {
        id: 'app',
        root: input.root,
        base: input.base,
        target: 'refs/heads/main',
        remote: { name: 'origin', url: `https://github.com/${TRIAL_REPOSITORY}` },
      },
    ],
    guidance: [
      {
        slot: 'review.rubric',
        ref: 'REVIEW.md',
        repository: 'app',
        sha256: sourceHash(TRIAL_FILES['REVIEW.md'] ?? ''),
      },
    ],
    policy: {
      endpoint: 'to-pr',
      intervention: 'none',
      uncertainty: 'blocked',
      delegations: DELEGATED.map((id) => {
        const text = JSON.stringify({
          schema: 'wholeloop/delegated-decision-rubric@1',
          decision: id,
          purpose:
            id === 'approve-build-plan'
              ? 'Approve only a bounded implementation plan and its proposed falsifying checks before code changes.'
              : 'Accept only exact-revision evidence satisfying the pinned HTTP status task.',
          rules: [
            { id: 'scope', text: task },
            {
              id: id === 'approve-build-plan' ? 'planned-validation' : 'evidence',
              text:
                id === 'approve-build-plan'
                  ? 'Require a minimal scope-preserving implementation plan with pre-edit inspection, planned npm run check and exact GET / JSON assertions. Assess these proposed checks before implementation. Require actual execution evidence at the later acceptance decision. Unresolved scope or authority assumptions remain blocking.'
                  : 'Acceptance requires the declared suite and a real HTTP response; a worker claim alone is insufficient.',
            },
          ],
          outcomes: ['accept', 'reject'],
          unknowns: { allowed: [], defaults: [] },
          timeoutMs: 900000,
        })
        files.atomic(`rubrics/${id}.json`, text)
        return {
          id,
          rubric: { ref: `rubrics/${id}.json`, sha256: sourceHash(text) },
          evidence: ['production'],
          fallback: 'blocked' as const,
        }
      }),
    },
    budgets: { ...DEFAULT_DELIVERY_BUDGETS },
    capabilities: [],
    definition: { ready: true, missing: [] },
    criteria: [
      {
        id: 'status',
        text: task,
        test: 'Run npm run check and GET /; assert the exact JSON status.',
        outcomes: ['status'],
        acceptance: 'machine',
      },
    ],
    work: [
      {
        id: 'status',
        repository: 'app',
        role: 'implementation',
        criteria: ['status'],
        after: [],
        consumes: [],
        produces: [],
      },
    ],
    milestones: [
      {
        id: 'service',
        work: ['status'],
        criteria: ['status'],
        after: [],
        procedure:
          'GET / on service web port 3000 and assert the JSON object {"status":"public fixture"}.',
      },
    ],
  }
}
