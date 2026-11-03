# 0206 — Live research pilot findings

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

The owner approved one EVAL-10 pilot. It is a none-policy research route on Claude Code 2.1.316 with `claude-opus-5-5`, run through the public `wl delivery run` with `npm run eval:live-research`. Its goal was to size the campaign. Each attempt ran until the first defect it hit. The first two defects, `sandbox-exec` ownership and the temporary directory, are recorded in [ADR-0203](./0203-contained-claude-code-boundary.md). This record covers the three that followed, and the result.

## Decision

- **No draft declaration for Claude's response schema.** Claude Code 2.1.316 rejects a `--json-schema` that declares draft 2020-12 (`no schema with key or ref`), so every structured launch failed before reaching the model. The Claude recipe now strips `$schema` at every level. The response schemas use no keyword specific to 2020-12, and the core still decodes every response against the original schema. A call to a nonexistent model confirmed the client accepts the stripped schema, at zero tokens. Codex keeps its own schema file conversion.
- **Judges are told the owned uncertainty IDs.** Real judges reported honest uncertainties under IDs they invented. The decision store blocks any uncertainty a rubric does not own ([ADR-0112](./0112-private-delegation-and-independent-machine-decisions.md)), so every decision with an uncertainty blocked. That rule stays. The judge brief now lists the rubric's owned IDs and says that any other material uncertainty must still be reported and will block. No authority or outcome changes; a rubric that owns no IDs still blocks every uncertainty.
- **An unexamined claim says so.** The research host examines only the claims the source worker marks load-bearing. The brief printed every retained claim as `Confidence: high; active refutations: 0/2`, including a claim that was never examined. Both delegated judges read that as a verified claim with missing verifier records and rejected the brief. A claim that is not load-bearing now reads `not load-bearing, so not independently examined`.
- **The trial rubric owns research uncertainties.** The pilot's `research-plan` and `research-sources` rubrics own `source-currency`, `coverage-gap`, `conflicting-sources` and `access-limited`, and their delegations complete with unknowns. That is the same policy the plan states for the route.

## Pilot result

The last attempt ran with no human wait for 793 seconds and made 25 native launches, all of which succeeded:

- the plan judge and its challenger;
- one source worker on the `native-web` angle, using live web search and fetch;
- three independent verifiers for each of six load-bearing claims;
- the source judge and its challenger.

The brief completed with unknowns. It holds seven claims cited from the official Claude Code and Codex sandboxing pages, no refutation, three open questions and three sources.

The `research-sources` judge rejected the brief, and its challenger supported the rejection. They gave two reasons: the unexamined claim rendered as verified, which is fixed above, and parts of that claim with no cited excerpt. The route therefore ended `blocked`. That is a correct none-policy outcome, not a completed EVAL-10 trial.

That report did not yet carry client-reported usage, so the pilot's quota cost is unmeasured. Receipts keep only output hashes and the client persisted no session, so it cannot be recovered.

## Client-reported usage

A native receipt now carries an optional `usage`, marked `client-reported`. It holds input, output, cache-read and cache-creation tokens, plus the client's own cost estimate in millionths of a dollar when the client gives one. Claude's figures come from its JSON result; Codex's are the sum of its `turn.completed` events. Malformed or missing reports yield no usage rather than a guess. A trial report sums them per run and counts the launches that reported nothing. This is evidence for sizing the campaign, never a budget: the plans are subscriptions that the runner cannot meter or enforce. The `delivery-native-run@1` schema gains the optional field, an additive change with an updated fingerprint.

## Diagnostic repeat

The owner approved one repeat after the fixes above, as a diagnostic that does not count toward the three required trials. It ran on the same client, model and question and **completed**:

- 968 seconds, no human wait, 26 native launches, all successful and host-observed: the plan judge and its challenger, one `native-web` source worker, three verifiers for each of seven load-bearing claims, and the source judge and its challenger.
- Both delegated decisions accepted, and both challengers supported them. The route ended `completed-with-unknowns` with no problem.
- The brief keeps eight claims cited from the official Claude Code and Codex documentation, no refutation, and five open questions. The one claim that is not load-bearing reads as not independently examined.
- Client-reported usage: 140 input, 64,581 output, 805,764 cache-read and 621,401 cache-creation tokens. The client's own cost estimate is 6.62 USD at API rates; the Pro subscription does not bill it, but it sizes a trial against the subscription's windows.

Two findings from it:

- **The run receipt reported the core's preflight.** With a runtime document only the controller bundle composes the host, so the core's own preflight said `public-host-native-runtime-unavailable` beside a completed route. The core now reports no preflight when the bundle runs with a runtime; the child evaluates it before dispatch and the status carries the result. A compiled-CLI case fails without the change.
- **Excerpts may be paraphrased.** The source worker noted in an open question that its excerpts came from the client's fetch tool, which summarizes pages, not from raw page bytes. The brief keeps that open, which is the honest outcome. Excerpt fidelity against the raw source is not established by these trials.

## Alternatives rejected

- Accepting any uncertainty ID would widen what a machine decision may accept, which only the owner can choose.
- Constraining uncertainty IDs in the response schema would force a judge either to hide an uncertainty or to change its outcome.
- Examining every claim would multiply verifier launches; marking unexamined claims is enough for an honest brief.

## Verification

- The recipe test fails when the declaration is passed through.
- A research test fails when an unexamined claim is rendered with a refutation count.
- Decision, delivery and research suites pass.
- The pilot's retained store and report are local evidence on the owner's machine; nothing was published.
