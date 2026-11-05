import type { RunnerCorrectionFeedback } from './correction-stages.js'

export const CORRECTION_MESSAGE =
  'fix(delivery): correct the recorded failure\n\nApply the owned correction for the continuation revision.\nVerification and acceptance remain pending against this commit.'

export const correctionTask = (feedback: RunnerCorrectionFeedback) => ({
  kind: 'repair' as const,
  prompt: JSON.stringify({
    instruction:
      'Correct only the recorded integration or acceptance failure within this pinned unit, starting from its failed head. Preserve acceptance definitions and criteria. Report production honestly; the commit and independent QA are separate.',
    feedback,
  }),
})
