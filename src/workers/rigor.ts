// Rigor is the person's explicit coverage choice for one research or gate run (ADR-0258).
// The step proposes it from the change or question; no profile, preset or dial ever sets it.
import { validate } from '../config/schema.js'
import rigorSchema from './schemas/rigor-v1.json' with { type: 'json' }

export const RIGORS = ['quick', 'standard', 'deep'] as const
export type Rigor = (typeof RIGORS)[number]
export interface RigorChoice {
  rigor: Rigor
  proposed: Rigor
  /** `person` when it was passed explicitly; `default` keeps today's standard coverage. */
  source: 'person' | 'default'
}
/** Deep runs examine each blocker or claim with at least this many independent verifiers. */
export const DEEP_VERIFIERS = 5

export function checkRigor(value: unknown): Rigor {
  if (!RIGORS.includes(value as Rigor)) throw new Error('Rigor must be quick, standard or deep')
  return value as Rigor
}

export function rigorChoice(requested: unknown, proposed: Rigor): RigorChoice {
  return requested === undefined
    ? { rigor: 'standard', proposed, source: 'default' }
    : { rigor: checkRigor(requested), proposed, source: 'person' }
}

/** A size proposal only; a person confirms it, and an unknown size never proposes quick. */
export function proposeGateRigor(paths: readonly string[], lines: number | undefined): Rigor {
  if (paths.length === 1 && lines !== undefined && lines <= 10) return 'quick'
  if (paths.length > 20 || (lines !== undefined && lines > 500)) return 'deep'
  return 'standard'
}

export function proposeResearchRigor(sources: number): Rigor {
  return sources <= 1 ? 'quick' : sources >= 4 ? 'deep' : 'standard'
}

/** What the chosen rigor covers, in the words every result shows the person. */
export function rigorCoverage(
  kind: 'research' | 'verify' | 'review',
  rigor: Rigor,
  verifiers: number,
) {
  if (kind === 'research')
    return rigor === 'quick'
      ? 'Quick: claims are not independently verified'
      : `${rigor === 'deep' ? 'Deep' : 'Standard'}: ${verifiers} independent verifiers per load-bearing claim`
  return rigor === 'quick'
    ? `Quick: mandatory checks only, optional lenses skipped; ${verifiers} independent refuters per blocker`
    : `${rigor === 'deep' ? 'Deep' : 'Standard'}: every applicable lens; ${verifiers} independent refuters per blocker`
}

export interface RunRigor extends RigorChoice {
  run: string
}
export const validRigorData = (data: Record<string, unknown>) => !validate(data, rigorSchema).length

/** Runs recorded before rigor existed ran at today's standard coverage. */
export const STANDARD_RIGOR: RigorChoice = {
  rigor: 'standard',
  proposed: 'standard',
  source: 'default',
}
/** The rigor a run uses and what it covers, shown with its plan and its result. */
export const rigorView = (
  kind: 'research' | 'verify' | 'review',
  choice: RigorChoice,
  verifiers: number,
) => ({ ...choice, coverage: rigorCoverage(kind, choice.rigor, verifiers) })
