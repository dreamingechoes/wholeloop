# 0101 — Separate native delivery hosts from gate launchers

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Delivery builders need controlled local edits, while the established gate launchers must remain read-only. Native version/help metadata cannot prove actual tool isolation, authentication, model availability or complete output. A worker claim, a fresh process or an unrestricted native permission mode cannot supply those missing facts.

## Decision

1. Add dedicated native delivery recipes and a controller host, preserving all existing gate recipes and result contracts. Keep seven target identities explicit. Claude 2.1.307 and Codex 0.163.0 are the initial pinned reference transports; other expanded targets return unverified rather than borrowing a broader launcher or pretending to support builders. Schema negotiation covers seven roles; ordinary queue execution covers the current work-unit roles. Decision/research orchestration remains its subsequent task.
2. Bind a trusted runtime observation to exact target/version/role, assignment, recipe policy digest and explicit selected model. Require observed authentication, containment, controller-store/credential denial, restricted tools, no interaction, bounded cancellation, complete output and owned artifact reading. The default host has no such proof and starts nothing. No CLI imports these observations as authority. A version/help response or synthetic PATH client remains metadata/fixture evidence.
3. Use Claude's pinned restricted mode with explicit file-tool lists, non-interactive permission behavior, isolated customization sources, no personal/external MCP and the exact JSON response schema. Builders alone receive implementation editing tools. Codex uses a named finite filesystem profile with platform-minimal reads, explicit selected paths, immutable input/policy reads, own-output writes and no command network. Disable shell execution, extra agents, apps/plugins/hooks/memory, automatic skills, image access, web search and external MCP. Do not pass legacy sandbox mode alongside the profile because it overrides profile selection. Managed restrictions still apply and may make the role unavailable.
4. Select one explicit model; never supply a fallback model or substitute a client on error. Construct a fresh native-client environment, home and temporary directory without inherited tokens, runtime injection options or personal configuration. A real observed host may explicitly reference the native client's own credential store outside repositories, worker roots and controller state; copy no credential values into files, argv, model input or the application environment. Fixture observations cannot enable that reference. The trusted client's authentication and untrusted model/application tools are separate boundaries; actual denial must be observed before advertising the capability.
5. Stage only the exact bounded context and non-secret response policy in an external owned directory. Register the actual spawned backend/PID tuple in the queue synchronously before delivering private input over stdin. Preserve the existing process transport's bounds, owned-group cancellation and startup-registry checks. Private-grant loss, changed fencing or deadline refusal stops input/result acceptance and cancels the observed process. Fresh attempts never resume a prior native conversation.
6. Seal raw Git control paths/configuration/index before execution and verify them before calling Git again. Replaced Git metadata could otherwise make a controller read invoke an untrusted helper. Treat changed metadata or commits as changed execution; preserve files for inspection. Read-only role workspace changes also fail. This check supplements actual runtime containment rather than replacing it.
7. Normalize only a successful native transport response, then apply the unchanged exact worker codec. Observe every declared output artifact's bytes and capture it through the existing persistent budget before scheduler completion. Preserve partial captures and quota failures; do not promote missing artifacts. Local workspace edits remain inside the durable admitted attempt; independent controller/provider mutations still use their scoped effect ledger and finite effect allowance.
8. Retain a closed native-run receipt separately from worker claims, with exact process metadata, signal when observed, captured output digests, candidate snapshot and canonical artifact references. Queue completion is scheduling evidence, not QA, human testing, publication or merge acceptance. Blocked/failed worker claims never become completed work. Known pre-launch refusals settle as not-started; late ownership/authority loss retains a failed/stale receipt rather than hiding behind transport exit zero.
9. Keep hard token/currency metering unsupported for these recipes. Missing native usage remains unknown; static flags or an account's estimated price do not prove a hard spend bound. Typed permission, model, MCP, authentication, timeout, cancellation, output, integrity and capability failures do not select a fallback or broaden policy.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Add editing tools to existing gate launchers | Weakens already reviewed read-only behavior |
| Treat a supported flag/version as runtime proof | Does not establish actual denial or account/model availability |
| Inherit the whole controller environment or copy native credentials | Exposes secrets and runtime injection options to worker code |
| Use broad read-only or full-access sandbox defaults | Exposes unrelated local files or weakens write boundaries |
| Send input before process registration | Leaves an unowned worker after a controller interruption |
| Read Git again after untrusted metadata changes | Can execute helpers selected by the modified configuration |
| Retry with another model, permissive mode or integration | Changes the authorized execution contract |

## Verification and limits

Synthetic PATH clients exercise actual stdin/process creation, exact native envelopes, artifact capture, timeout/cancellation/revocation and typed failures. Seven-target tables test role/capability denials. Named-version help/version probes are separate from actual native model conformance. A macOS Codex permission-profile-only probe can test owned filesystem fixtures without a model; it does not establish native tool-registry, account, model, Linux or full backend acceptance. Preserve failed/unavailable probes as well as successful observations. P6-12/P6-13/P6-27 retain physical backend lifecycle and actual native end-to-end obligations.

## Sources and links

- [Official Codex configuration reference](https://developers.openai.com/codex/config-reference/) and [permission-profile semantics](https://learn.chatgpt.com/docs/permissions); behavior is additionally pinned to local help/version observations.
- [Native host guide](../tutorials/delivery-native.md).
- [Role protocol](./0100-role-bound-worker-contexts-and-execution-observations.md) and [budget accounting](./0099-persistent-finite-delivery-budgets.md).

[◀ Decisions index](./README.md)
