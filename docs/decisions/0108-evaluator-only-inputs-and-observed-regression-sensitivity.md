# 0108 — Evaluator-only inputs and observed regression sensitivity

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A builder can weaken tests it can edit. A successful candidate case also says nothing about whether the same case detects the original regression. Shared controller files, a tool's exit zero and a model's assertion cannot establish a private evaluator boundary or semantic test sensitivity.

## Decision

1. Pin private objective HTTP definitions in the external controller store before builder admission. Bind run, plan revision, source, public case and relevant assertion identities. The public case carries only the private definition digest; its fixture digest must match. Existing private pins remain immutable and readable after admission. Public inspection returns identity/counts, never hidden requests or expected values. Preparation grants no execution authority.
2. Compile the reviewed evaluator source at build time and embed it in the self-contained CLI. The installed CLI needs no compiler, checkout or universal mutation dependency. Keep the helper bundle below 256 KiB and reuse the exact existing HTTP and objective-assertion implementations. The reference private host deliberately supports declared HTTP request cases; unsupported private runner kinds/restarts remain unavailable rather than being approximated.
3. Under the original scoped test effect, create an owned input volume, initialize only fixed case/program files without network, and mount it read-only into a nonroot owned evaluator. Give it no application workspace, controller store, native credential store or Docker socket. Encode transport payloads as canonical base64 inside bounded ASCII JSON, then compare actual copied-byte hashes. Raw per-chunk Buffer-to-string concatenation corrupts split UTF-8; ordinary nested JSON escaping can also exceed a nominal pipe bound. The decoded one-MiB case and 256-KiB program maxima fit the unchanged two-MiB transport cap. Bind its immutable helper image, actual app IP/port, complete bounded responses, source/program digests and actual native invoker/daemon completion. Application containers receive only their real requests and bounded outcomes; they cannot mount or weaken the evaluator inputs. Existing native worker admission still requires actual containment and controller-store denial. A same-user controller filesystem remains trusted, not a claimed private boundary.
4. Observe baseline cleanliness while it is current. Require the pinned Git base, no dirty/untracked substitute and selected inputs actually tracked in that base. Save that observation before later candidate changes. Compare the unchanged private definition, evaluator program and execution recipe. Only implementation-script bytes and allocated controller paths may differ; selected fixture/guidance/package/tool bytes, images, commands, networks and limits remain identical. A setup failure, changed configuration or wrong base is not a relevant regression failure.
5. Require a completed relevant baseline mismatch followed by the latest current candidate pass when regression sensitivity is applicable. Read verified controller artifacts, registered native closes and exact applied effects; import no result JSON. Preserve ordering, stale candidate checks and uncertainty. A new feature's baseline absence and explicitly inapplicable regression sensitivity are separate outcomes. Aggregate acceptance also enforces this requirement, so a candidate-only pass cannot bypass it; sealed reports can retain a failure but cannot promote it to acceptance.
6. Offer a bounded optional declared phase-test mutation command. Observe its actual process/exit and parse only a closed consistent counter report. Label engine/version and counters as repository-reported data; retain output digests and unknown semantic sensitivity. Missing commands, invalid reports, zero mutants and unknown execution never become semantic proof. Run optional native commands before the private behavior assertion. Required native command success belongs in an ordinary required CLI case.
7. Compare canonical URL origins, including default HTTP ports, without relaxing foreign-route or credential refusal. Otherwise a declared port 80 application would be incorrectly treated as a foreign origin after standard URL normalization.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Put hidden inputs in the builder worktree or rely on a same-user directory name | The builder could read or change the acceptance standard |
| Execute application code in the evaluator's private filesystem | Gives the code under test access to its expected answers |
| Run only the candidate or treat a broken baseline setup as red | Does not show that the agreed test detects the regression |
| Compare different images, commands or fixture bytes | Can confuse a changed execution standard with a repaired implementation |
| Leave sensitivity as an optional report beside passing aggregate acceptance | Lets publication consumers bypass required applicability |
| Install a universal mutation framework or trust counters as semantic truth | Adds broad maintenance cost and still cannot prove arbitrary product behavior |
| Require a new API/MCP/cloud platform for independent evaluation | The existing owned backend and deterministic core already supply the necessary boundary |

## Verification and limits

Unit tests cover immutable pins, admission ordering, changed bytes, exact fixture binding, unsupported requests, complete actual HTTP observations, cancellation, fixture/native separation, clean-base identity, configuration drift and counter consistency. The opt-in evaluator observes actual read/write denials from owned application containers, unchanged negative requests failing on the base and passing on the candidate, native fixture-counter reporting, unavailable mutation hosts, new-feature classification, candidate edits and aggregate sensitivity enforcement. Repeat API/CLI and browser evaluations after shared-runtime/origin changes. Scope independent Linux-host, native coding-client/model and real mutation-engine certification separately; no account, publication or project merge is implied.

[◀ Decisions index](./README.md)
