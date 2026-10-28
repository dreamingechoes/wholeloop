# 0147 — Original verification continuation

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A correction suite alone cannot complete requirement verification. The controller must select a distinct captured environment, retain the original failed gate and deadline, run the actual suite, then obtain independent read-only judgments over the corrected HEAD. Lost responses must not renew budgets or replay work.

## Decision

Add internal verification continuation through the fixed original correction checkpoint. Preserve the same source subject/run, immediate next round, unchanged allowance, exact plan/stage and narrower original correction/controller deadline. Validate the already prepared environment and unchanged acceptance/command selection before publishing intent or planning. Capture that selection once; recovery never calls its selector again.

Persist original intent before planning, then a separate one-shot dispatch marker before suite/model work. Reopen lost planning responses from the exact original next round. Bind the active private locator to that round, environment selection and corrected HEAD. Use the namespaced owned suite executor first; a failed suite remains a known blocked verification without a model. Only an observed passing suite permits independent native requirement inspection/refutation. Native admission, observation and current-candidate checks use the fixed correction checkpoint and original parent bounds.

Paused recovery can restore an active locator and seal a lost verdict from exact original suite/native observations, without another environment selector, model factory or command. Missing original work stays unresolved. Historical contract-unit validation may omit only the old snapshot's equality to current HEAD; it still reobserves declared immutable artifact bytes/metadata and exact original units. Active contract verification retains current snapshot equality. This does not adopt a new contract, approve a human decision or complete the root stage automatically.

Complete-route configuration, repeated correction generations, combined feature acceptance and public execution remain separate technical work. This increment composes one original failed verification with its direct correction and a fresh independent round.

## Alternatives rejected

A suite-only pass omits requirement judgment. Reusing the old environment or gate verdict tests different bytes. Fresh runs or larger allowances reset failure history. Calling selectors during recovery can silently change scope. Replaying after a dispatch marker can duplicate work. Treating a gate verdict as root-stage completion would bypass the runner's own observed-transition validation.

## Verification

Run verification/suite/feedback/frozen regressions and a finite actual Docker composition. Pin a script before builder admission that fails on the initial candidate and passes only after the synthetic corrector changes the actual candidate bytes. Run that unchanged script in a distinct captured environment, then independent synthetic verifier processes. Lose the planning response and final verdict write; pause, remove the active locator and recover without selectors or hosts. Preserve the original run/allowance, narrower deadline, failure history and active root stage, then retire both exact environments. These normalized native judgments do not certify authenticated models, containment, an independent Linux application host or product acceptance.

All 448 directed regressions and four new composition checks pass on macOS Node 24. The existing observed-pass and contract-pass actual Docker scenarios also pass with unchanged limits. All exact environments are observed retired. Static/docs/package checks pass; current full-suite, authenticated-native, independent Linux application-host and whole-product acceptance remain unestablished.
