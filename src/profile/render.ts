import type { Profile } from './presets.js'

export function renderProfile(profile: Profile): string {
  return [
    'Style for this run:',
    {
      brief: '- Explain briefly; one line per action unless more is requested.',
      standard: '- Give enough reasoning and context to assess each action.',
      detailed: '- Explain reasoning, context and trade-offs in detail.',
    }[profile.verbosity],
    {
      product: '- Use product vocabulary and observable outcomes.',
      balanced: '- Balance product outcomes with useful technical detail.',
      technical: '- Use technical vocabulary; name files, functions and queries.',
    }[profile.depth],
    {
      supportive: '- Point out assumption gaps constructively.',
      balanced: '- Challenge unsupported assumptions firmly and kindly.',
      adversarial: '- Challenge assumptions and argue the opposite case at decisions.',
    }[profile.challenge],
    {
      guided: '- Run one worker at a time.',
      staged: '- Run independent workers in bounded stages.',
      parallel: '- Run independent workers concurrently when dependencies allow.',
    }[profile.pace],
    profile.stops === 'every-step'
      ? '- Pause after every step and at every required decision.'
      : '- Pause at every required decision.',
    profile.teaching === 'on'
      ? '- Explain why the process uses each step as you work.'
      : '- Keep process explanations short unless requested.',
    profile.language === 'auto'
      ? '- Match the conversation language.'
      : `- Speak in language code ${profile.language}.`,
    `- Write artifacts in language code ${profile.artifact_language}.`,
    '- Preserve all checks, lenses, caps, required questions, preflight and receipt; stop on request.',
  ].join('\n')
}
