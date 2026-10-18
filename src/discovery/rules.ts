export const SLOT_RULES = [
  ['research.method', /research|discovery/],
  ['frame.template', /framing|frame-problem/],
  ['spec.template', /specification|product-spec|prd|spec-template/],
  ['flags.naming', /feature-flag|flag-naming/],
  ['slice.conventions', /slice|user-stor|ticket/],
  ['build.backend', /backend|api-architecture/],
  ['build.frontend', /frontend|ui-kit/],
  ['build.mobile', /mobile|ios|android/],
  ['build.infra', /infrastructure|terraform|deployment/],
  ['build.data', /data-pipeline|data-model/],
  ['build.design-system', /design-system|ui-kit|design-token/],
  ['verify.suite', /test-suite|verification|verify-suite/],
  ['review.rubric', /code-review|review-checklist/],
  ['commit.convention', /commit|commitlint/],
  ['open-pr.convention', /pull.request|open-pr/],
  ['comms.voice', /brand-voice|tone-of-voice/],
  ['launch.templates', /release-notes|runbook|launch-template/],
  ['ramp.criteria', /ramp|exposure/],
  ['learn.report', /impact-review|impact-report/],
  ['learn.decision', /decision-record|decide-next/],
] as const

export function knownSlot(slot: string): boolean {
  return SLOT_RULES.some(([name]) => name === slot) || /^build\.[a-z][a-z0-9-]*$/.test(slot)
}
