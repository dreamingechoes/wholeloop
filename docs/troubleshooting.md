# Troubleshooting — find the failing boundary

> **TL;DR** — Separate source build, managed files, native discovery, model access and workflow state. Diagnose the named boundary before reinstalling or granting permissions. A stored preflight, copied plugin or zero process exit is not evidence that a complete native step succeeded.

> [!NOTE]
> **Status: 🚧 partial.** Core diagnostics, ownership checks, redacted conformance diagnosis and recovery commands are implemented. Remedies below describe how to investigate; they do not certify the current account, native permissions or service availability.

## Start with the symptom

| Symptom | Start here |
| --- | --- |
| `wl` is not found, or the bundle path disappeared | [Executable path](#the-shell-cannot-find-wholeloop) |
| Installed files exist but no skill appears | [Native discovery](#files-installed-but-the-skill-is-missing) |
| Doctor returns exit 3 | [Doctor findings](#doctor-reports-a-failure-or-unknown) |
| The client cannot run a tool or model | [Native access](#the-client-denies-a-tool-or-cannot-use-a-model) |
| An install/update refuses to overwrite files | [Ownership](#installation-reports-changed-unowned-or-pending-files) |
| A new session cannot find earlier work | [Store and identity](#a-new-session-cannot-find-my-work) |
| Status says closed after on-hold | [Closed outcomes](#on-hold-is-reported-as-closed) |
| A terminal command stops instead of drafting/building | [Core versus skill](#next-returned-json-but-did-not-run-the-whole-flow) |
| A script reports a nonzero exit | [Exit codes](#understand-exit-codes) |

Examples use an absolute `WHOLELOOP_CLI` path. If it is not set, run the following from the wholeloop source checkout:

```bash
npm run build
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
node "$WHOLELOOP_CLI" --version
```

## The shell cannot find wholeloop

Managed installation writes native client components; it does not add a global `wl` command. Use `node "$WHOLELOOP_CLI" ...` from a source build. A shell variable also does not survive opening a new terminal: export the path again, or invoke the absolute bundle path directly.

If `dist/wl.mjs` is absent, build from the source checkout after `npm ci`. Development needs Node 22 or newer; the bundle supports Node 20 or newer. Do not confuse a native client's own runtime requirements with the bundle's minimum.

## Files installed but the skill is missing

1. Restart/reload the intended client in the application repository. A prior process may have cached its skill inventory.
2. Check the target and scope you installed. Project scope belongs to that application, not whichever repository happened to be open during setup.
3. Request the exact managed name: `wl-frame-problem`, or `wl-agy-frame-problem` on Antigravity. Managed Claude loose skills and `/wholeloop:...` plugin entrypoints are different delivery routes.
4. Run doctor for that explicit target and inspect managed ownership/currentness. A matching file is still not proof of native trust or activation.
5. Follow the target's [local setup](./platforms/local-onboarding.md) for its native directory, overrides and separate activation requirements.

Do not install another copy repeatedly to resolve an unexplained discovery conflict. Existing owned output can be updated; unowned policy/configuration is preserved rather than overwritten.

## Doctor reports a failure or unknown

```bash
node "$WHOLELOOP_CLI" doctor --target claude --json
```

Replace the target with your chosen client. Read the failed check's reason and suggested diagnostic/remedy. A missing executable, a failed version command, a store-write problem and stale artifacts are different issues. Doctor does not automatically repair them.

An optional provider declaration or standalone artifact can remain unknown when it is not part of your exercise. Conversely, version/file success does not authenticate a provider, execute a model or establish read-only isolation. Required failures cause exit 3. [Doctor behavior](./getting-started.md#check-the-installation).

## The client denies a tool or cannot use a model

Native login, account/project eligibility, trust and permission policy belong to the selected client. Inspect the exact denied action and choose its intended scoped approval through that client's normal setup. Do not grant blanket permissions, borrow credentials or silently choose another model to force a passing receipt.

The recorded trials distinguish missing authentication, ineligible access, permission denials and upstream availability. Some clients return process exit zero while a tool was denied; required journal events and final evidence still determine conformance. [Observed client results](../roadmap/manual-verification.md#automatic-native-client-trials-2026-10-22).

If you have an actual conformance run ID, set the variable to it and inspect only the retained diagnostic categories:

```bash
node "$WHOLELOOP_CLI" conformance diagnose "$CONFORMANCE_RUN_ID" --json
```

Use the same external store as that run; explicitly store-bound conformance commands also accept `--store`. Diagnosis does not reveal raw prompts/tool arguments or fix the account. Inspect interrupted effects before making a fresh attempt. Upstream connection errors are not evidence that changing permission policy will help.

## Installation reports changed, unowned or pending files

Install and uninstall operate on exact owned bytes. Edited/unowned output, unsafe links or unexpected private-tree contents are preserved and refused. Inspect the reported path, ownership receipt and external backups before deciding whether to retain edits or choose a fresh output/scope. There is no automatic force/adoption option.

For an ordinary source update, rebuild first and inspect the same target/scope's dry run. If output is unchanged it reports `already-correct`. After an interruption, a pending receipt retains the intended/observed work; use its supported recovery path rather than deleting control state. [Managed installation](./platforms/README.md#installing).

## A new session cannot find my work

Check the actual initiative/slice ID, the store environment and the repository context. A shell opened under different XDG settings reads a different store. A similar title in another repository is not necessarily the same initiative; use the explicit stored ID for continuation across contexts.

After setting `INITIATIVE_ID` to the actual receipt ID:

```bash
node "$WHOLELOOP_CLI" status --json
node "$WHOLELOOP_CLI" status "$INITIATIVE_ID" --json
node "$WHOLELOOP_CLI" state get "$INITIATIVE_ID" --json
node "$WHOLELOOP_CLI" resume "$INITIATIVE_ID" --json
```

Status and resume do not consume messages or advance work. The [local core tour](./tutorials/local-core.md) intentionally uses an isolated store; its recovery command must retain that demo's state override. [State locations](./architecture/state-and-messaging.md).

## On-hold is reported as closed

That is expected after a completed no-go framing. Generic status can show `closed` with `next: null`; the exact on-hold/dropped outcome, reason and reopening condition are in its completion receipt and stored record. A new session should preserve that result.

Do not rerun the same idea to bypass the decision or create a duplicate. Inspect the record and obtain an explicit reopening decision if circumstances changed. [First-framing receipt](./tutorials/first-framing.md#6-inspect-the-receipt) · [Framing identity rules](./flow/define/frame-problem.md#available-core-commands).

## Next returned JSON but did not run the whole flow

The terminal core does not draft artifacts or call a language model. It begins or resumes a step contract, returns questions/preflight and stops. In your coding client, request the installed `wl-next` skill to perform the model-backed work and continue until a required decision.

Likewise, `questions: []` in a successful framing preflight means the core has enough structural inputs to start. It does not mean the client has answered the eight framing questions. [Core tour](./tutorials/local-core.md#what-to-look-for) · [Utilities](./flow/utilities.md).

## Understand exit codes

| Code | Meaning | Next action |
| --- | --- | --- |
| `0` | The command's requested operation succeeded | Read its receipt; success is scoped to that operation |
| `1` | Unexpected error | Preserve the command/context and investigate the failure |
| `2` | More input is required | Answer the returned questions; do not invent answers |
| `3` | A precondition is not met | Resolve the named dependency, permission, state or required diagnostic |
| `4` | Invalid input/shape or a refused workflow result | Read the validation/receipt and correct the actual problem |

Use `--json` to inspect the versioned result. A command that asks a question is not a crashed program. In shell automation, capture a deliberate nonzero result explicitly rather than disabling error handling for the entire script. [Core contract](./architecture/core-cli.md#design-rules).

## Report a useful problem

Include the exact source revision/core version, operating system/architecture, Node and client versions, the command or requested skill, its exit/result and the expected behavior. Distinguish actual native execution from fixtures. For a workflow problem, include sanitized IDs and the mismatch rather than a raw private journal or credential-bearing transcript.

Use [V1 acceptance](./v1-acceptance.md#what-evidence-to-return) for the handoff format. A discovered implementation defect returns to technical work; it is not waived as another manual checkbox.

## Interrupted delivery state

Use [checkpoint and recovery inspection](./tutorials/delivery-checkpoints.md) to distinguish stale inputs, an unobserved worker, an ambiguous effect and a retained writer lock. Status/effect inspection starts no host. Ordinary commands never steal a lock; explicit digest-bound repair retains a writer record only after observing its PID absent. Live/reused/inaccessible or malformed identities require inspection. Restore/rebind actual inputs and authority rather than marking a pending write applied or resetting an exhausted gate.

## Docker environment unavailable or stale

Use the [Docker environment guide](./tutorials/delivery-docker.md) and retain the exact runtime ID/history. Preflight starts nothing: verify the explicit image cache, observed engine/platform support, requested capacity including helper/proxy overhead and current private grant. Scoped egress or secret delivery is explicitly unavailable. A changed candidate, old ready record or successful Docker client exit cannot establish readiness. Never retry an issued ambiguous creation by name or execute an undo declaration automatically; use the [lifecycle guide](./tutorials/delivery-lifecycle.md) for explicit observed stop/reconciliation/retirement. Unknown invokers or resource identities retain data; no stored PID is signaled.

<!-- docnav -->
[◀ Original delivery evaluation fixtures](tutorials/delivery-evaluation-fixtures.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [V1 acceptance ▶](v1-acceptance.md)
