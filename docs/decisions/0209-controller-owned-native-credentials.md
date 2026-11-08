# 0209 — Controller-owned native credentials

- **Status:** Accepted
- **Date:** 2026-11-04

**Amended 2026-11-08.** Implementation notes from P6-35, observed on Claude Code 2.1.319 and Codex 0.166.0 without a model call:

- A runtime client names either a signed-in `store` or a `credential` reference, never both.
- An injected launch gets a client home inside its launch directory, and Claude's sandbox profile then grants no Keychain access; the real client started and read a fabricated token under that profile.
- No reference client validates an injected credential without a model call. `claude auth status` reports any injected token as signed in, and `codex login status` ignores `CODEX_API_KEY`. The boundary observation therefore proves only that the client reads the injected variable (Claude) or that the item resolves (Codex). A wrong value shows at the first launch, and the preflight can check presence, not validity.
- A launch whose item does not resolve ends with the existing `authentication-required` reason, so the v1 receipt contract is unchanged.
- The usage-window signal is read before dispatch, not taken from a failed launch. Codex 0.166.0 reports its window through its app server's `account/rateLimits/read`, with no thread or model call; Claude Code 2.1.319 reports none. An exhausted window moves the run to `waiting-external`, because the controller's lease stays live only there and an operator pause would end the controller. The controller then waits for the reset and queues the same run again. A reset after the deadline leaves the run `paused`. API-key accounts have no subscription window and are not read.

**Accepted on 2026-11-08** by the maintainer as the design. Implementation is [P6-35](../../roadmap/phase-6-autonomous-delivery.md#p6-35--controller-owned-worker-credentials); the verification listed below still has to pass, with real accounts, before the feature is relied on.

## Context

In autonomous delivery, `wl delivery run` launches its own native workers (planner, builder, verifiers, judges) as separate headless processes. Each one runs inside a containment boundary. This record is about those workers only.

The harness used inside a person's own agent session (skills, agents, steps, hooks) runs on that session's sign-in and needs no credential from wholeloop. It is out of scope.

Today a worker authenticates through a dedicated client home that the operator signed in to once. For Claude Code that sign-in lives in the macOS login Keychain, which the boundary profile lets the client read but not write ([ADR-0203](./0203-contained-claude-code-boundary.md)). The P6-27 campaign showed what that costs:

- **Token expiry ends unattended runs.** When the access token expires, the client cannot store the refreshed token. Every launch after expiry fails with `permission-denied` and zero tokens. That happened three times: in the afternoon, overnight, and once with the client writing a plaintext `.credentials.json` as a fallback, before the profile denied it.
- **The usage window ends runs too.** A Claude Pro five-hour usage window ran out mid-batch and failed two trials. The operator's interactive session draws on the same window.
- **The workaround needs a person every time.** The operator signs in again before every batch, which defeats "authorize once, run unattended".

Codex is not affected: its own process runs outside the sandbox it applies to tool commands, so it refreshes its session itself.

The 1.0 scope is Claude Code and Codex as autonomous-delivery reference clients. Gemini, OpenCode, Copilot and Cursor follow in 1.x, and Antigravity stays unavailable ([validation spec](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md)). The design must still cover all of them, on macOS and Linux first and on Windows later.

### What was verified (2026-11-04)

Each installed client was probed with a fabricated credential and an empty home, so no prior sign-in was available. The client's own error tells whether it consumed the injected value ("invalid key or token") or ignored it ("not logged in"). No probe spent a token.

| Client and version | Injected per launch | Account kind | Result |
| --- | --- | --- | --- |
| Claude Code 2.1.316 | `ANTHROPIC_API_KEY` | API key | Consumed on macOS, on Debian Linux (arm64), and inside the boundary profile with the Keychain denied for read and write. |
| Claude Code 2.1.316 | `CLAUDE_CODE_OAUTH_TOKEN` | Subscription (`claude setup-token`) | Same as above. |
| Codex 0.166.0 | `CODEX_API_KEY` (read by `codex exec`) | API key | Consumed on macOS and Linux. `OPENAI_API_KEY` and `CODEX_ACCESS_TOKEN` are ignored by `exec`. |
| Codex 0.166.0 | none needed | ChatGPT account | Refreshes itself. `cli_auth_credentials_store` accepts `file`, `keyring`, `auto` and `ephemeral`. |
| Gemini CLI 0.27.0 | `GEMINI_API_KEY` | API key | Consumed. A Google-account sign-in has no injection path; it keeps and refreshes its own session (not exercised). |
| OpenCode 2.2.5 | the provider's key, for example `ANTHROPIC_API_KEY` | API key per provider | Consumed. |
| Copilot CLI 1.0.83 | `COPILOT_GITHUB_TOKEN` | GitHub token of an account with Copilot | Consumed. |
| Cursor Agent 2026.07.16 | `CURSOR_API_KEY` | Key of a Cursor account | Consumed. |
| Antigravity 1.4.7 | none found | Google account, browser sign-in | `-p` ignores `GEMINI_API_KEY` and `AGY_ADC_AUTH` and always asks for a browser sign-in. |

On the controller side, the macOS Keychain stores and returns a value without interaction, and without the value appearing in any process's arguments (`security -i` reads the command from stdin). No client wrote a credential file during the probes.

Public documentation adds three points:

- A token from `claude setup-token` is described as lasting about a year with no automatic refresh. Open reports describe 401 errors with such tokens in some versions and in long-lived processes, while one-shot `claude -p` runs work.
- Anthropic spend limits apply per organization and per workspace, not per API key. A key in a workspace with a monthly limit gives the same effect.
- OpenAI recommends API keys for automated Codex runs and sets budgets per project.

## Decision

- **The controller owns every worker credential.** `wl` stores each binding's credential in the operating system's secret store: the Keychain on macOS, Secret Service on a Linux desktop, and the Credential Manager on Windows. It never keeps a credential in a file.
- **Credentials are injected per launch.** At each launch the controller passes the credential to that one process in memory, through the variable the client consumes. Through stdin would be preferred where a client supports it.
- **No worker can touch a credential store.** Every boundary profile denies reads and writes of every credential store. The client home becomes disposable per run, so no sign-in, session or refreshed token persists inside a worker.
- **Each account kind has one supported mode per client:**

  | Client | API key | Account without an API key |
  | --- | --- | --- |
  | Claude Code | `ANTHROPIC_API_KEY` | `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` |
  | Codex | `CODEX_API_KEY` | ChatGPT sign-in kept by the client with `cli_auth_credentials_store = "keyring"`, refreshed by the client itself |
  | Gemini | `GEMINI_API_KEY` | not supported until a headless injection path exists |
  | OpenCode | the provider's key | the provider's own path, decided per provider |
  | Copilot | `COPILOT_GITHUB_TOKEN` | the same token (the account credential) |
  | Cursor | `CURSOR_API_KEY` | the same key (the account credential) |
  | Antigravity | — | unavailable as a worker |

- **Preflight before any work is claimed.** Before claiming a run, the controller checks that every bound role has a credential, that it authenticates with one minimal no-model call where the client offers one, and, where known, that it does not expire within the run's wall-time budget. Any failure ends the run before dispatch with a named reason. A run never fails mid-way on a credential the controller could have checked.
- **An exhausted usage window pauses the run.** When a launch reports that the subscription window is exhausted, the run pauses and resumes once the window resets. It does not fail, and the work done so far is kept. Deciding that a report means "window exhausted" needs a client-reported signal. Until a client gives one, the attempt stays an infrastructure failure under the campaign rule.
- **Antigravity is a documented exception.** It stays unavailable as a worker, reported at preflight, until it has a headless mode with an injectable credential. Its harness use inside an Antigravity session is unaffected. The README, the platform guide and the user guides say so.
- **Platforms: macOS and Linux first.** A Linux host without a desktop has no standard secret store. There the operator chooses a supported store explicitly (for example `systemd-creds` or an external secret manager), and the controller never falls back to a file. Windows is supported through WSL2 until native containment and the Credential Manager are verified.

## Verification still required

- **One real call per client and account kind**, with a valid credential, inside its boundary. It spends quota or money and needs the maintainer's accounts and approval.
- **The lifetime of a `claude setup-token` token**, and its behaviour across a full campaign.
- **A signal for an exhausted usage window**, for each client that has one.
- **A secret store on a headless Linux host**, and the Windows path.
- **The exposure of an environment variable** to processes of the same user, compared with stdin where a client accepts it.

## Alternatives rejected

- **Writing the Keychain from inside the boundary.** It lets a model-driven process change the operator's login Keychain.
- **Refreshing a subscription token outside the boundary before each launch.** No client offers a refresh-only command that is verified to call no model, and it runs the client uncontained.
- **Asking the operator to sign in before each batch.** That is the current workaround. It works only within a token's lifetime and contradicts unattended operation.
- **One credential store shared by all workers.** A compromised worker would reach every client's credential.

## Consequences

Once accepted, this replaces the dedicated, signed-in client homes of [ADR-0203](./0203-contained-claude-code-boundary.md) with per-run disposable homes and injected credentials. That makes the Keychain allowance in the Claude profile unnecessary.

The runtime and bindings documents gain a credential reference per binding: the name of an item in the secret store, never its value. The public host identity digests that reference, so a different credential source is a different host.
