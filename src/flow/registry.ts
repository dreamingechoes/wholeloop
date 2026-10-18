import { stripCode } from '../docs/markdown.js'
import { FRAME_SECTIONS } from '../framing/contract.js'
import { SCOPE_SECTIONS } from '../scopes/contract.js'
import { SPEC_SECTIONS } from '../spec/contract.js'
import type { ItemKind } from '../state/events.js'

export const STEP_NAMES = [
  'research',
  'frame-problem',
  'write-spec',
  'cut-scopes',
  'slice-work',
  'build-slice',
  'verify-works',
  'review-code',
  'open-pr',
  'prepare-launch',
  'ramp-exposure',
  'measure-impact',
  'decide-next',
] as const
export type StepName = (typeof STEP_NAMES)[number]
export interface Step {
  name: StepName
  kind: ItemKind
  available: boolean
  optional: boolean
  before: readonly string[]
  after: readonly string[]
  sections: readonly string[]
  slots: readonly string[]
}

const STEP_SLOTS: Record<StepName, readonly string[]> = {
  research: ['research.method'],
  'frame-problem': ['frame.template'],
  'write-spec': ['spec.template'],
  'cut-scopes': ['flags.naming'],
  'slice-work': ['slice.conventions'],
  'build-slice': ['build.backend', 'build.frontend', 'build.design-system', 'commit.convention'],
  'verify-works': ['verify.suite'],
  'review-code': ['review.rubric'],
  'open-pr': ['open-pr.convention'],
  'prepare-launch': ['comms.voice', 'launch.templates'],
  'ramp-exposure': ['ramp.criteria'],
  'measure-impact': ['learn.report'],
  'decide-next': ['learn.decision'],
}

export const STEPS: readonly Step[] = Object.freeze(
  STEP_NAMES.map((name) =>
    Object.freeze({
      name,
      slots: Object.freeze(STEP_SLOTS[name]),
      kind: (name === 'research'
        ? 'brief'
        : ['slice-work', 'build-slice', 'verify-works', 'review-code', 'open-pr'].includes(name)
          ? 'slice'
          : ['prepare-launch', 'ramp-exposure', 'measure-impact', 'decide-next'].includes(name)
            ? 'scope'
            : 'initiative') as ItemKind,
      available: ['frame-problem', 'research', 'write-spec', 'cut-scopes'].includes(name),
      optional: name === 'research',
      before: Object.freeze(name === 'open-pr' ? ['test-it'] : []),
      after: Object.freeze(
        name === 'write-spec'
          ? ['approve-spec']
          : name === 'cut-scopes'
            ? ['approve-scopes']
            : name === 'ramp-exposure'
              ? ['ramp']
              : name === 'decide-next'
                ? ['decide']
                : [],
      ),
      sections: Object.freeze(
        name === 'frame-problem'
          ? [...FRAME_SECTIONS]
          : name === 'cut-scopes'
            ? [...SCOPE_SECTIONS]
            : name === 'write-spec'
              ? [...SPEC_SECTIONS]
              : name === 'research'
                ? ['Question', 'Owner', 'Claims', 'Dropped claims', 'Open questions']
                : [],
      ),
    }),
  ),
)

export function stepDefinition(name: string): Step {
  const step = STEPS.find((candidate) => candidate.name === name)
  if (!step) throw new Error(`Unknown step: ${name}`)
  return step
}

/** Shape rules are deterministic; semantic evidence checks belong to later gates. */
export function checkShape(content: string, sections: readonly string[]): string[] {
  const headings = new Map<string, string>()
  let current: string | undefined
  for (const line of stripCode(content)) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) {
      current = match[1]?.toLowerCase()
      if (current) headings.set(current, '')
    } else if (current) headings.set(current, `${headings.get(current) ?? ''}${line.trim()}`)
  }
  const problems = sections
    .filter((section) => !headings.get(section.toLowerCase()))
    .map((section) => `Missing or empty required section: ${section}`)
  if (!content.trim()) problems.unshift('Artifact must not be empty')
  return problems
}

/** Decisions stop consumers; authors can still correct the producing or earlier definition. */
export function decisionBlocks(step: string, decision: string): boolean {
  const producer = STEPS.findIndex((entry) => entry.after.includes(decision))
  return producer < 0 || STEPS.findIndex((entry) => entry.name === step) > producer
}
