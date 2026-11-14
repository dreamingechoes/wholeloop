# 0120 — Observed native boundaries and asynchronous admission

- **Status:** Accepted
- **Date:** 2026-10-26

**Amended 2026-11-14.** No delivery builder recipe has a shell: Claude Code gets read and edit tools, and Codex only its patch tool. The builder was never told so. A live Codex 0.166.0 builder on `gpt-6.1-sol` received an approved plan naming `npm run check` and pre-edit inspection, could neither read files nor run the suite, and returned `blocked` with no change after 130 seconds. Every builder assignment now states that it cannot run commands, that the controller runs the suite, QA and acceptance after it returns, and that it should inspect only through its tools and the supplied inputs. Rejected: giving builders a shell, which would widen the containment this record sets.

## Context

The native transport deliberately refuses unobserved runtime capabilities. A fixed host needs actual permission/process observations before model input; version/help text, worker JSON and recipe declarations alone do not supply them. Such controls are asynchronous and can themselves own a process. Treating a timed-out control as an unavailable no-op would free its original attempt while a native group might still exist.

## Decision

Allow bounded asynchronous native-boundary observation under the original assignment deadline and caller cancellation. Keep synchronous observers compatible. A thrown, cancelled or timed-out probe retains its original consumed attempt; it cannot launch the model, free unknown ownership or acquire a fresh allowance. Return a redacted controller error rather than arbitrary observer diagnostics.

Add a fixed Codex 0.163.0 observer for the exact regenerated reference recipe, assignment, role, model selection and output mode. Use a separate empty client home for controls and require the trusted caller's registered process runner. Before admission, observe the installed version, recognized disabled feature flags, allowed public reads, denied controller/credential references, expected workspace/output permissions, denied network access and actual owned cancellation/closure. Explicitly disable default-mode user input rather than depending on a changing client default. Preserve fixture provenance and refuse unsupported/malformed/stale/unknown results.

Disable unrelated browser/computer, agent messaging, goal, authentication-elicitation and approval entrypoints explicitly. Native calls also disable daemon startup. Do not confuse the resumable command backend with command-tool visibility: the installed client keeps unified_exec enabled despite a user opt-out, while shell_tool controls command execution tools. The actual flag observation and [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) agree on that distinction; preserve the rejected-control repro instead of pretending the ignored flag worked.

Open public project-file witnesses for read/write access and close them without writing bytes. Empty or otherwise unsuitable workspaces remain unsupported rather than creating project files for a permission test. Keep Git control sealed across the probe. The network witness is an owned local listener; only a positive permission-denied error establishes denial. Node receives an explicit empty OpenSSL configuration because the client's intentionally empty environment otherwise causes a denied optional system configuration read; do not widen filesystem permissions.

Consume a private original-run/attempt/generation/grant control slot before issuing any native process and bind it to the exact assignment. Context, role and policy changes cannot acquire another allowance within the same attempt. Retain original controls and hashes externally; no blind replay follows a lost result. Policy-only controls return authenticated=false. The full observer separately asks the trusted client's local login-status command, using its own explicit credential-store reference, and binds only hashes/status/ownership to the final proof. Never copy credential values, raw authentication output or inherited environment values into files, argv or application tools. Model availability and model/tool end-to-end acceptance remain separate observations.

Provide opt-in model-free controls for planner, builder and verifier with both file and inline-proposal output (six controls). It creates an empty credential reference and a disposable actual Git worktree, uses registered native groups and verifies unchanged project snapshots. It never queries an account or invokes a model. This internal observer does not complete fixed worker/semantic host composition or public runner execution; P6-10 stays open.

## Alternatives rejected

Self-reported containment or version-only admission would promote declarations into runtime proof. Broad system/configuration reads would weaken the permission test. Creating a project file as a write witness would change the assigned candidate before implementation. Reusing a missing native result as permission to probe again would bypass original reservations. Logging authentication output would retain unnecessary sensitive data. Treating fixture or policy-only evidence as authenticated native acceptance would obscure what still needs execution.

## Verification

Use explicit fixture-provenance transport cases for all selected roles, policy/feature/nonce/shape/network refusal, private authentication-output hashing and unknown one-shot ownership. Exercise asynchronous observation, real deadline cancellation and consumed-attempt preservation through the existing native-purpose transport. Run actual model-free Codex controls on macOS for all three roles and both output modes; retain the initial OpenSSL failure and correct it without broader permissions. Complete checks pass 3078 tests in 147 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Nine model-free runner controls and inert schema parity pass on Linux Node 20.0.0/Git 2.39.5. Six actual Codex policy controls pass on macOS only. No skips or test deadline increases occur. Actual Linux native containment, accounts, models and full-route acceptance remain unverified.
