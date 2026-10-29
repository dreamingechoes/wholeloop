# 0158 — Current unit QA and owned assembly

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

A passing set of isolated units and an assembled Git tree are separate facts. Whole-product QA needs the exact current combination: every original unit's observed verification/review, the complete required vector and a matching owned assembly whose native Git effects are positively closed. Neither fact alone proves that relationship or combined application behavior.

## Decision

Join a fixed same-store milestone-QA reader to the existing owned assembly domain. Require matching run, current plan, source, grant, milestone and the exact complete original part vector. Reconcile only existing assembly metadata, reopen current unit QA and recheck the unchanged assembly and plan after those asynchronous reads. Require every selected original Git effect applied, host-observed and positively stopped, and require current owned assembled heads.

Return combined candidates only after those proofs agree. Missing, changed, partial or unknown evidence yields no candidates. Inspection dispatches no worker, suite, checkout or merge and may recover only original metadata, including while paused. A ready result explicitly leaves integration QA, feature acceptance, root-stage completion and publication unestablished. The next composition must execute the whole-product behavior checks against these exact combined candidates.

## Alternatives rejected

Trusting an assembled status alone skips current unit QA. Trusting unit flags accepts unsupported or stale claims. Trusting a supplied part subset omits dependencies. Returning a combined candidate before rechecking later asynchronous observations admits changing inputs. Treating assembly readiness as a product pass skips combined behavior and acceptance.

## Verification

Refuse pending unit QA, unknown milestones and foreign-store readers without returning a candidate or changing the journal. Execute an actual Docker suite and independent synthetic verification/review, assemble its complete original vector through bounded registered Git wrappers, then join those exact proofs. Require changed assembly bytes to refuse, identical evidence after restoration and paused fresh-object recovery without factories, Git replay or journal changes. Keep root integration running and integration QA/acceptance pending, then retire only the exact original environment. Record actual results before commit; synthetic judgments do not certify authenticated models or independent Linux application hosts.

Seven directed admission/vector controls pass on macOS Node 24.22.0. All four actual Docker/synthetic-worker composition controls pass: original suite/verification and independent review, exact bounded owned assembly, changed-byte refusal/identical restoration, paused fresh inspection with unchanged journal and pending root/product QA, and exact environment retirement. Preserve synthetic versus authenticated-model provenance. The exact npm tutorial instruction also passes all four controls and retires its environment. Complete isolated Linux checks pass 3340 tests in 174 files and all remaining checks. The journal records exact frozen scopes and separate wrapper validation; full-route acceptance remains unestablished.
