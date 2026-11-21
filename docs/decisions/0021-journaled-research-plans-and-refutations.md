# 0021 — Journal research plans and count active refutations

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

**Amended 2026-11-21 (P9-06).** Public research completion now asks the conductor for an Answer and Recommendation bound to the exact plan and aggregate digest. The core retains its evidence rendering, derives confidence and unchecked work, and stores the authored prose in the existing completed artifact event. No extra state file or evidence-replacement path is introduced; generic completion cannot bypass this boundary.

Read-only research never executes repository code. Native workers must have read-only tools and any required parent boundary; an unproven boundary yields unavailable evidence. Codex custom roles inherit parent permissions and MCP configuration rather than overriding them, as the [native configuration documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) confirms; supported feature reductions do not prove a separate sandbox.

The separate private research controller still produces an evidence ledger without an authored conclusion. [P9-23](../../roadmap/phase-9-user-experience.md#p9-23--autonomous-research-includes-an-authored-conclusion) tracks that newly identified surface after the original task order, without fabricating prose or expanding source authority in this change.

**Amended 2026-11-21 (P9-05).** Source selection precedes plan pinning. Detection offers candidates with access labels; it cannot add an angle. The new wholeloop/research-sources@1 view contains no jobs, and source submission or completion remains blocked until an explicit or remembered choice creates the existing research.planned event.

Native code and web are suggestions for the first question. Suggestions require actual native access and exactly the expected code or web capability; replacing a provider definition cannot inherit a suggestion through its name alone. Only the executing client's MCP declarations count as access here; another client's declaration and a PATH executable remain labelled limitations, never connection evidence.

Research workers can finish in any order, lose source access or stop responding. Recomputing source selection from current configuration during aggregation would change the question under those workers. Keeping only the final Markdown would also lose the evidence needed to explain a dropped claim after a session ends.

## Decision

1. Offer source candidates before pinning. Ask once with native code and web suggested; an explicit --sources choice, or remembered providers.sources, selects the providers. Pin the question, owner, chosen source angles and verifier quorum in a research.planned event for one started brief run. Repeated planning returns that plan; conflicting choices require a new run, and configuration changes apply to the next run.
2. Journal one structured source result per angle and one examination per claim and verifier slot. Validate all inputs before the transaction commits.
3. `research.verifiers` accepts 3, 5, 7 or 9, default 3. A load-bearing claim drops only on a strict majority of active, evidence-backed refutations. Uncertainty and missing responses keep it, lower confidence and expose open questions.
4. Render the public brief deterministically from recorded evidence and an authored, current-basis conclusion. Answer and Recommendation precede the full question and evidence; confidence and unchecked work come from the aggregate, never from caller-provided ratings. Generic step completion rejects missing conclusions or replacement evidence, and the core checks the basis again inside completion. The existing completed artifact event retains the entire rendered content, so rebuilding restores it byte for byte.
5. Researcher and challenger roles declare only read/web capabilities; generation refuses a write or shell capability. Research never executes repository scripts, tests, builds or package commands, and a client unable to establish read-only tools must return unavailable. Native and sequential engines transport the same assignments. The host must give verifier slots independent sessions; numeric slot uniqueness is enforced by the core, while actual session independence requires client conformance.

6. Remember a run choice in the existing external plan journal, or explicitly in project/user configuration. Configured sources replace detection, including an explicit empty list. Validate offered IDs before writing preferences; repeated identical settings do not rewrite configuration.
7. MCP access counts only for the executing client. A declared adapter cannot override its client identity; an unbound terminal may explicitly name its client, and otherwise no MCP declaration counts as current-client access. An unavailable provider remains unavailable and never grants another route or credentials. Unmapped MCP servers appear once as not usable yet with the provider guide.
8. The wholeloop/research-sources@1 choice view has no worker jobs before selection. It is additive; existing plan, event and output declarations stay frozen.

Public verifier output collapses confirmations to one line per claim, retains disputes and unique verifier evidence, and preserves uncertainty reasons. Source quotations remain quotations; prose cannot introduce new artifact sections. New brief titles are bounded while the original question remains in the body. Existing step/event schemas and fingerprints remain unchanged; the conclusion input and context output have new identities.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Let prose replace the aggregate | Could remove a dispute or invent evidence |
| Reuse an answer after evidence changes | The conclusion would no longer describe the observed snapshot |
| Derive a narrative answer from a list of claims | Invents an interpretation the conductor did not author |
| Store prose in a second runtime file | The existing artifact event already provides immutable replay |
| Trust native provider names after replacement | Names cannot prove native access or expected coverage |
| Every detected source becomes an angle | Detection cannot establish relevance or consent |
| Union configured sources with detection | A remembered choice could never narrow the source set |
| Treat another client or an executable as access | Neither establishes the required tools, connection or authentication here |
| Add a separate run preference file | The existing pinned journal already retains the explicit run choice |
| Keep plans and results only in the host session | Compaction and client changes lose the basis for conclusions |
| Re-read source selection before completion | A configuration edit silently changes required coverage mid-run |
| Count confirmations to retain a claim | A silent verifier would remove a real finding |
| Accept an arbitrary final brief | The recorded conclusion could bypass the refutation arithmetic |

## Consequences

The journal is larger because it retains structured evidence and examinations. Failed providers remain explicit unknowns. Tests with stubbed workers can verify coverage, scheduling and arithmetic; live source access, read-only behavior and independent host sessions still need manual conformance.

## Verification

- `test/unit/research/conclusion.test.ts` snapshots answer-first artifacts, confidence and disputes; it checks stale input, direct-core bypass attempts, replay, bounded prose, terminal controls, short titles and real CLI flags.
- `test/unit/adapters/worker-roles.test.ts` checks all seven role configurations and rejects injected write/shell capabilities. Codex inherited permissions remain explicit, and actual native enforcement stays in manual verification.

- `test/unit/research/source-choice.test.ts` covers every client, all access labels, no jobs before selection, source/identity validation, unknown MCP deduplication, run/project/user preferences, user preferences across repositories, explicit empty lists, idempotent settings and built CLI flags.
- `test/unit/research/research.test.ts` checks configured-only plans, immutable run coverage, structured results and replay. Framing and sharing fixtures make their source choice explicitly before adopting a brief.
- `test/unit/contracts/compatibility.test.ts` retains all old fingerprints and registers only the new choice schema and output variant. Live authentication, source relevance and native access remain client-conformance evidence.

## Links

- [Research](../flow/define/research.md)
- [Orchestration tiers](./0006-orchestration-tiers.md)
- [Configurable gate budgets](./0014-configurable-gate-round-budgets.md)

[◀ Decisions index](./README.md)
