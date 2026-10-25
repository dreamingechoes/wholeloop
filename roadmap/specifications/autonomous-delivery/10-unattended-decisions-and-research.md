# Fully unattended decisions and research

> **TL;DR** — The owner may authorize an entire flow with zero subsequent human intervention. Delegate the named decisions under explicit constraints, keep machine decisions visibly machine-made and return an honest terminal limitation when a required condition cannot be met. Preserve all quality gates and native permissions.

> [!NOTE]
> **Status: 🚧 partial.** P6-34 private decision policy, rubric pins, independent controller-host judgments, machine provenance, current-plan readers and no-prompt fallbacks pass complete macOS/Linux checks at their deterministic/controller-host boundary. Complete native route orchestration and P6-33 research remain pending. Legacy supervised commands retain their existing approvals. See the [controller guide](../../../docs/tutorials/delivery-decisions.md).

## Implemented policy boundary

P6-34 implements DEC-02–DEC-06 policy/record enforcement through purpose-specific private rubric pins, exact current input bindings, independent trusted host observations, machine provenance, no-prompt fallbacks, finite original budgets and read-only historical inspection. Model-free controls and compiled CLI tests preserve fixture provenance. Interrupted published locators recover without replay; unpublished results and stale decisions cannot supply authority. DEC-01 and native end-to-end portions retain their P6-10/P6-27 obligations. P6-33 implements the complete research route later.

## Independent axes

| Axis | Values | Meaning |
| --- | --- | --- |
| Endpoint | `research-report`, `local-handoff`, `to-pr`, `to-merge` | Maximum requested result and allowed effects |
| Intervention | `supervised`, `on-exception`, `none` | Whether later human questions/decisions are allowed |
| Decision delegation | Explicit IDs, rubric, evidence requirements and fallback | Which judgments the system may make |
| Runtime capabilities | Observed native/backend/tool grants | What can actually execute |

None of these axes grants the others implicitly. Unattended research does not authorize editing code. Unattended PR delivery does not authorize merge. An autonomous merge grant does not authorize deployment, messages or production changes.

## Single initial authorization

Support both an exact approved plan and a request envelope authorized before the detailed plan exists. The latter binds source revision, owner intent, repositories, required outcomes/exclusions, decision rubric, acceptable unknowns, endpoint, capabilities and budgets. It allows the system to plan, challenge and accept a derived plan without another human turn.

The controller validates structural scope and policy, and an independent challenger evaluates semantic fit. Record that semantic judgment and its limitations; it is not proof that a vague request has one correct interpretation. A derived plan cannot expand repositories, remove required outcomes, weaken evidence or add effects. Keep the original envelope and each derived plan digest.

One initial instruction can select `none` and delegate all decisions needed by the chosen route. Before execution, deterministically report any unsupported required capability or non-delegable criterion. A wrapper may return that plan/authorization receipt and run without an additional interactive confirmation when the initial operator request already supplies explicit authority.

## Decision policy

| Decision | Default supervised behavior | Explicit unattended delegation |
| --- | --- | --- |
| Research angles, source selection and clarification | Ask where needed | Choose within source/domain/budget policy; record assumptions and unavailable sources |
| Framing outcome and final draft | Owner outcome and exact revision approval | Independent challenge plus a delegated policy outcome; preserve hypothesis/unknown labels |
| Spec and scopes | Named human approval | Accept exact reviewed revisions within the authorized intent/envelope |
| Builder plan/assumptions | Human decision where required | Evaluate allowed assumptions/risk rubric; resolve within scope or return blocked |
| Testing before PR | Actual human testing | Distinct delegated acceptance for explicitly machine-evaluable criteria |
| Merge | Outside current automatic behavior | Separate `to-merge` authority and all host eligibility/protection checks |
| Ramp | Human stage choice; flags untouched | An explicitly delegated assessment/proposal only; no flag mutation |
| Learning outcome | Named human decision | A delegated evidence-backed keep/iterate/kill/unflag decision; effects remain separate |

Proposed `wholeloop/delegated-decision@1` contains decision ID, run/plan/assignment identity, policy/grant digest, exact artifact/evidence basis, actor kind, outcome, rationale, uncertainties, independent challenge reference and timestamp. Existing `by` fields must never be populated with the owner's name to conceal a machine choice.

Decision delegation cannot disable required gates, turn an observed failed test into success, refute a finding without counterevidence, or satisfy a code host's independent human-review requirement. Existing profiles still control communication/concurrency rather than authority.

## Ambiguity and unknowns

The initial policy chooses among: investigate within budget, apply an explicit default, select the least-scope reversible interpretation, complete with owned unknowns, produce an on-hold/dropped result when authorized, or terminate blocked. Each choice records why it was permitted.

A necessary fact is not invented to avoid a human question. A missing numeric baseline remains unknown. A research report may complete with unknowns if its contract permits that outcome; a feature requiring unavailable credentials cannot claim implemented/verified behavior. Do not treat uncertainty as high confidence because the run is unattended.

For `none`, disallow ask-user tools, interactive stdin prompts, owner-directed pending decisions and human approval waits after initial authorization. Return terminal `blocked`, `failed`, `exhausted`, `stopped` or an allowed complete outcome. Pending remote observations can wait only within finite configured deadlines. A later manual continuation is a new explicit control action, never a hidden requirement for the first run to finish.

## Complete research route

Reuse `ResearchWorkflow`, existing source operations, claim identities, confidence, open questions and active-refutation rules. Add a runner host for planning source angles, querying available sources, collecting bounded evidence, challenging load-bearing claims, synthesizing and completing the brief.

Default bounded research policy: at most 8 angles, 40 fetched source documents, two evidence-repair cycles and a 30 minute wall deadline within the enclosing run budget. Source content is bounded to 1 MiB each; excerpts respect provenance/copyright constraints and do not become executable instructions.

Pin source references/revisions or retrieval dates and content digests. Distinguish independent sources from mirrors/reposts. Resolve conflicting claims through cited analysis or retain the conflict. Temporal claims name their observation date. Access-denied, paywalled and unavailable sources remain unavailable; the system cannot silently substitute invented evidence.

Use independent claim refuters and unchanged fail-safe aggregation. A crashed refuter contributes no successful refutation. Replanning angles cannot remove an unresolved load-bearing claim just to finish; explain exclusions and the policy-selected report outcome.

The final brief contains the question, scope/method, evidence-backed claims, source/counterevidence references, confidence, unresolved questions with responsible roles, limitations, decision/recommendation if authorized and a precise receipt. Default publication is external local storage. Remote sharing requires a distinct destination/effect grant.

## Example operator requests

These are intended product requests after implementation, not current executable commands:

```text
Implement the feature defined in this selected issue/document.
Use intervention none and finish at a ready pull request.
I authorize planning, scoped implementation, actual QA, independent
adversarial review, integration tests and the required publication steps.
Delegate the named plan/spec/scope/acceptance decisions within this request.
Keep the agreed outcomes and repository constraints.
Do not ask me questions during execution.
If a prerequisite cannot be resolved under the policy, return a terminal
blocked report with retained work and evidence. Do not merge.
```

```text
Research this question using the selected sources and repository context.
Use intervention none through final report completion.
Choose and challenge the research angles within the granted limits.
Preserve missing facts and contradictory evidence explicitly.
Store the brief locally; do not edit code or publish remotely.
Do not ask me questions during execution.
```

The first request's merge variant must additionally name `to-merge`, the allowed target/method and exact merge/protection policy. A bare “fully unattended” instruction does not supply those effects.

## Acceptance cases

- [ ] **DEC-01:** One initial envelope authorizes plan generation and a full none-policy implementation route; no later human turn is needed.
- [ ] **DEC-02:** Each default human decision can be explicitly delegated at its supported scope, with machine provenance and an exact reviewed basis.
- [ ] **DEC-03:** A profile, source prompt or worker cannot enable delegation, expand an envelope or claim the owner's identity.
- [ ] **DEC-04:** Human-only criteria, external review requirements and missing runtime capabilities are preflighted or return terminal blocked results.
- [ ] **DEC-05:** Unknown facts remain unknown under every ambiguity policy; no interactive tool or human wait is emitted in none mode.
- [ ] **DEC-06:** A revoked/changed policy invalidates future machine decisions without rewriting historical ones.
- [ ] **RSR-01:** A full native research flow plans, queries, refutes, synthesizes and completes with zero post-authorization prompts.
- [ ] **RSR-02:** Contradictory sources, mirrors, stale dates and unsupported claims retain explicit evidence/uncertainty.
- [ ] **RSR-03:** Unavailable sources and crashed refuters never become successful observations or dropped blockers.
- [ ] **RSR-04:** Research budgets, cancellation and checkpoint recovery preserve source identities and the original question.
- [ ] **RSR-05:** Research source injection cannot edit files, publish remotely or acquire implementation/merge authority.
- [ ] **RSR-06:** Complete-with-unknowns and blocked are distinct terminal outcomes, validated against the initial contract.

Run deterministic policy tables, hostile source fixtures, compiled process recovery and real reference-client research/implementation trials. Count actual interactive tool events; a model's self-report of autonomy is insufficient.

[◀ Validation](./09-validation-and-acceptance.md) · [Specification index](./README.md)
