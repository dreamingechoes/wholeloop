# 0256 — Person-facing display rendered by the core

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

**Amended 2026-11-21 (P9-08).** Every skill now loads a short speaking protocol with the same vocabulary map used by the experience lint. A deterministic lint rejects internal terms in instructions to speak while retaining exact private command and field spellings. Core-only declarations are checked without loading them into the step; historical implementation caveats no longer prompt irrelevant warnings. Short command notation does not change the checked execution route.

**Amended 2026-11-21 (P9-07).** Step commands now attach wholeloop/display@1 through the shared structured-result emitter before serialization, using only their returned observations. Machine data is serialized once; human text never parses or serializes unrelated payload fields. The same pure renderer supplies terminal output; document problems, recorded builder plans, measurement unknowns and pending publication remain explicit rather than disappearing in a generic summary. Plan recording returns its already-validated plan for this view, without another query; errors retain their exit codes and actionable message. Their headers use parsed routing inputs, never an adapter name or a guessed check; an unknown check is labelled neutrally. Native completion events use the stateless display-progress formatter; headless completion callbacks use the same line format. Ordinary JSON remains silent on stderr unless --progress is explicitly requested. Native rendering, completion timing and verbatim forwarding remain observations for the per-client manual pass.

Every documented step session shows one compact layout: a header naming the step and its subject, aligned key and value lines, short progress lines, results marked passed, failed or unknown, then what was produced, the open questions and the next command. No skill, protocol or command defines that layout. The output contract asks skills to "show the returned preflight" and "show its receipt" in prose, and the step payloads carry internal fields (run IDs, bindings, digests, the profile's style block), so each model improvises a presentation and repeats the core's vocabulary to the person.

A trial of `wl-research` in Codex on 2026-11-17 showed the result: the person read about preflights, slots and refutation quorums instead of the answer. Most `wl` commands also print their JSON payload when `--json` is absent, so the terminal shows the same internals.

Presentation has one right answer for a given payload, which by [ADR-0003](./0003-deterministic-core-cli.md) belongs in the core with a test, not in a prompt.

## Decision

- Every step command's payload gains a versioned `display` block: `header`, `rows`, optional `progress`, `produced`, `open` and `next`, plus `text`, the block rendered as plain text at 80 columns. The block is additive to the existing schemas.
- The same renderer produces the human output of step commands without `--json`. The block has an explicit registered source schema; existing payload fields and their frozen declarations stay unchanged. Non-step human commands are completed by P9-09. Headers stay on one line; rows and artifact paths wrap at 80 terminal cells, preserving grapheme boundaries and removing terminal control sequences.
- While workers run, `progress` gives one line per observed finished worker and elapsed milliseconds since the fan-out began. A native host formats its actual completion observation through `display progress`; the command reads no store and records no event. Headless fan-out emits the same line through callbacks, enabled by `--progress` for JSON callers. No timer, liveness poll or guessed completion is added, and cached rounds emit no new completion. A failed presentation observer cannot invalidate returned evidence.
- The output contract changes: a skill shows `display.text` verbatim for questions, plans and completed results, adds only what the person needs to decide, and never narrates internal fields or shows raw JSON. Coordination acknowledgements and conclusion-writing context stay private; while assignments run only completion lines appear, so one result submission cannot create a second preparation header. The preflight becomes the header line; the profile style block is for the agent only.
- The output contract of [ADR-0010](./0010-interaction-profile-never-changes-coverage.md) still holds: the preflight and the receipt are always shown, now as the `display` header and its produced lines. `verbosity` changes only the explanation around `display`, never `display` itself.
- A banned-terms list and its person-facing equivalents are kept beside the renderer; the experience check (P9-20) lints transcripts against it. Every skill loads speaking-to-person; the harness lint checks imperative speaking instructions and the exact startup protocol list. Machine commands, schema examples and private fields retain their real spelling. This deterministic lint does not claim semantic understanding of arbitrary prose.
- Commands suggested for human reading use short wl notation, without --json unless machine output was requested. Actual execution retains the client's checked packaged launcher, including Claude's plugin-root binding; notation grants no PATH lookup, alias or extra permission. Core-owned implementation declarations remain enforced but are not loaded into skills. Conditional provider guidance loads only for the relevant operation.
- First-question, plan and answer call budgets remain pending the manual P9-20 baseline; bounded startup reads and fixture coverage do not substitute for that calibration.

## Alternatives rejected

- **Ban internal identifiers everywhere in a prompt.** Commands and private schemas must preserve exact spelling; lint speaking instructions and actual displayed transcripts instead.
- **Install an alias or trust PATH to shorten examples.** Changes execution provenance and can select an unrelated core; keep short notation separate from the existing checked launcher.

- **A layout described in the protocol for models to follow.** Each client and model would still render it differently, and nothing could test it.
- **Human output only in the CLI.** Clients would keep improvising from the JSON, which is where most of the noise came from.
- **Showing every coordination acknowledgement.** A second header per worker contradicts the one-completion-line rule. Keep those machine responses private while retaining their evidence and errors.
- **Serializing, parsing and serializing the same result again.** Adds redundant work on every step command. The shared emitter receives its structured result directly.
- **New state queries or progress files for presentation.** Repeat reads add cost and can disagree with the operation just observed; the renderer consumes its existing result only.
- **Periodic progress guesses or noisy JSON by default.** Time cannot establish worker completion. Native events and explicit headless progress preserve observation and existing machine-stream expectations.

## Consequences

Skills get shorter and the experience is the same on every client. Every step command needs a renderer and snapshot tests; documented sessions can be generated from real `display` output instead of written by hand.

## Verification

- `test/unit/harness/communication.test.ts` covers all mappings, rejected speaking instructions, private command/data compatibility, step-specific reads and all seven generated skill catalogs.

- `test/unit/display/display.test.ts` snapshots all thirteen steps and progress states, checks every declared step command, exercises compiled terminal/JSON forms and checks the policy rendered for all seven adapters.
- `test/unit/fanout/fanout.test.ts` checks one completion per synthetic worker, observer failure, JSON silence and explicit progress in actual local subprocesses.
- `test/unit/experience/experience.test.ts` accepts core display text and rejects the same payload shown as raw JSON.
- Compatibility tests preserve every prior schema, command, step and exit contract; only new display identities are registered.

[◀ Decisions index](./README.md)
