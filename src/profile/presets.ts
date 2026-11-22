// Built-in interaction presets: how much a run explains, challenges and asks, never what it covers.
export const PRESETS = {
  mentor: {
    verbosity: 'detailed',
    depth: 'balanced',
    challenge: 'supportive',
    pace: 'guided',
    stops: 'every-step',
    teaching: 'on',
  },
  pair: {
    verbosity: 'standard',
    depth: 'balanced',
    challenge: 'balanced',
    pace: 'guided',
    stops: 'decisions',
    teaching: 'off',
  },
  sparring: {
    verbosity: 'standard',
    depth: 'technical',
    challenge: 'adversarial',
    pace: 'staged',
    stops: 'decisions',
    teaching: 'off',
  },
  autopilot: {
    verbosity: 'brief',
    depth: 'balanced',
    challenge: 'balanced',
    pace: 'parallel',
    stops: 'decisions',
    teaching: 'off',
  },
} as const
export type Preset = keyof typeof PRESETS
export interface Profile {
  preset: string
  verbosity: 'brief' | 'standard' | 'detailed'
  depth: 'product' | 'balanced' | 'technical'
  challenge: 'supportive' | 'balanced' | 'adversarial'
  pace: 'guided' | 'staged' | 'parallel'
  stops: 'decisions' | 'every-step'
  teaching: 'off' | 'on'
  language: string
  artifact_language: string
}

const DIAL_WORDS: Record<string, Record<string, string>> = {
  verbosity: { brief: 'brief answers', standard: 'standard detail', detailed: 'full explanations' },
  depth: { product: 'product depth', balanced: 'balanced depth', technical: 'technical depth' },
  challenge: {
    supportive: 'supportive challenge',
    balanced: 'balanced challenge',
    adversarial: 'adversarial challenge',
  },
  pace: { guided: 'one step at a time', staged: 'staged steps', parallel: 'parallel work' },
  stops: { decisions: 'stops at decisions', 'every-step': 'stops after every step' },
  teaching: { on: 'explains as it goes' },
}

/** One line per profile, derived from its dials so an extension profile is described the same way. */
export function profileDescription(dials: Readonly<Record<string, string>>) {
  return Object.keys(DIAL_WORDS)
    .flatMap((dial) => {
      const value = dials[dial]
      const words = value === undefined ? undefined : DIAL_WORDS[dial]?.[value]
      return words ? [words] : []
    })
    .join(', ')
}
