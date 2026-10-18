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
