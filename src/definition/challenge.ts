// Challenger modes for definition documents and the plan that assigns them.
import { createHash } from 'node:crypto'
import { checkShape } from '../flow/registry.js'
import { checkFrame, FRAME_SECTIONS } from '../framing/contract.js'
import type { Profile } from '../profile/presets.js'
import {
  checkScopePlan,
  parseScopePlan,
  SCOPE_SECTIONS,
  type ScopeContext,
} from '../scopes/contract.js'
import {
  checkSlicePlan,
  parseSlicePlan,
  SLICE_SECTIONS,
  type SlicingContext,
} from '../slices/contract.js'
import { checkSpec, SPEC_SECTIONS } from '../spec/contract.js'
import { lintCriteria, parseCriteria } from './criteria.js'

export const CHALLENGE_MODES = ['problem', 'spec', 'criteria', 'scopes', 'slicing'] as const
export type ChallengeMode = (typeof CHALLENGE_MODES)[number]
const COVERAGE: Record<ChallengeMode, readonly string[]> = {
  problem: [
    'Observed problem and affected people',
    'Evidence versus hypothesis and missing answerers',
    'Expected impact, cost, priority and stop conditions',
    'Counterexample that would reverse the go decision',
  ],
  spec: [
    'Story ownership and observable acceptance tests',
    'Contradictions, boundaries, empty and error paths',
    'Metric source, baseline, target and measurement window',
    'Rollout, rollback and technical assumptions',
  ],
  criteria: [
    'Observable behavior and falsifiable tests',
    'Structurally contradictory assertions',
    'Boundary, empty, error and unauthorized paths',
    'Unwanted behavior that could still pass',
  ],
  scopes: [
    'Independent release and measurement',
    'Complete story and metric ownership',
    'Delivery mode, flag convention and argued complexity',
    'Explicit dependencies, cycles and missing cuts',
  ],
  slicing: [
    'Exactly one user-visible outcome per slice',
    'An end-to-end demonstration with observable results',
    'Testable criteria and test-case coverage',
    'One part per repository, contract repository first',
    'Explicit acyclic dependencies and complete scope delivery',
  ],
}
const STYLE = {
  supportive: { tone: 'Ask constructively and explain the gap.', questions: 1 },
  balanced: { tone: 'Challenge firmly and kindly; require evidence.', questions: 2 },
  adversarial: { tone: 'Argue the opposite case and demand a falsifying example.', questions: 3 },
} as const

export function challengePlan(
  mode: ChallengeMode,
  content: string,
  options: {
    challenge: Profile['challenge']
    context?: ScopeContext
    slicing?: SlicingContext
  },
) {
  let problems: string[] = []
  try {
    switch (mode) {
      case 'problem':
        problems = [...checkShape(content, FRAME_SECTIONS), ...checkFrame(content)]
        break
      case 'spec':
        problems = [...checkShape(content, SPEC_SECTIONS), ...checkSpec(content)]
        break
      case 'criteria':
        problems = lintCriteria(parseCriteria(JSON.parse(content))).map(
          (finding) => finding.message,
        )
        break
      case 'scopes': {
        problems = checkShape(content, SCOPE_SECTIONS)
        checkScopePlan(parseScopePlan(content), options.context ?? { metrics: [], stories: [] })
        break
      }
      case 'slicing': {
        problems = checkShape(content, SLICE_SECTIONS)
        checkSlicePlan(parseSlicePlan(content), options.slicing ?? { criteria: [] })
        break
      }
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : 'Invalid definition artifact')
  }
  const style = STYLE[options.challenge]
  const coverage = [...COVERAGE[mode]]
  return {
    schema: 'wholeloop/challenge-plan@1',
    mode,
    source: { sha256: createHash('sha256').update(content).digest('hex') },
    coverage,
    style,
    problems,
    instructions: [
      `Challenge mode: ${mode}. ${style.tone}`,
      ...coverage.map((check) => `Check: ${check}.`),
      `Ask up to ${style.questions} additional counter-questions after reporting every finding.`,
      'For each finding return the location, defect, evidence and a falsifying example; keep unknowns explicit.',
      'Read only. Do not rewrite the artifact or treat an empty structural report as semantic approval.',
    ].join('\n'),
  }
}
