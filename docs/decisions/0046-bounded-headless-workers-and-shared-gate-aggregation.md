# 0046 — Bounded headless workers and shared gate aggregation

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A gate must keep its lenses, quorum and verdict when its transport changes. Headless clients can hang, crash, return a different assignment or emit a plausible JSON answer before ultimately failing. Starting concurrent CLI processes also needs bounded cost and cancellation that reaches their owned descendants.

## Decision

- Consume an existing gate round through GateHost/inspectGateRound. Require the actual suite first for verification; read-only semantic workers do not invent process results. Planning, repairs and budget extensions remain explicit.
- Spawn one shell-free process per assignment in its own external-store directory and POSIX process group. Send bounded prompts through stdin; reuse no session. Limit concurrency to 1–16, timeout to 100–600000 ms, assignment size to 2 MiB and combined output to 1 MiB. Terminate then kill owned groups on timeout/cancellation.
- Bind responses to a digest of the pinned plan, assignment, review input and suite observation, plus exact run/round/unit or finding/verifier. Decode only successful final client output, then validate the existing public result/vote schemas.
- Reuse the core submit/refutation/verdict paths. A crashed/invalid inspection is unavailable; a failed refuter contributes no vote. Abort on an observed workspace mutation, preserve its files and never repair or grant a fresh budget automatically.
- Hold a round ownership directory outside the journal lock across async work. Keep owner metadata for physical-crash inspection; never steal a stale-looking lock. Cache decided rounds and skip already recorded units/votes on resumption.
- Persist status/exit metadata and hashes, not raw prompts/stdout/stderr. Workers receive the pinned patch/rubric and original finding, not other verifier votes.
- Start with Claude/Codex recipes probed against installed help and primary docs. Claude restricts built-in tools to reads and disables ordinary customization/MCP; Codex starts ephemeral read-only with approvals disabled, ignores user config and starts outside the project to avoid loading its MCP configuration. Both preserve the user's credential store; this implementation never writes credentials.
- Keep real-client conformance open. Help and synthetic PATH clients prove argument construction/normalization boundaries, not model execution or isolation. Managed policies/hooks, ignored files, external services, transient restored writes and actual permissions require manual checks. OpenCode/Copilot recipes remain code work.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Put quorum or repair decisions in a worker prompt | Makes verdicts transport-dependent |
| Allow a failed worker to confirm a refutation | Treats missing evidence as agreement |
| Start all CLI workers at once | Unbounded process cost and no concurrency contract |
| Pass the patch in argv or save raw debug logs | Exposes context through process listings and retained diagnostics |
| Kill only the immediate client | Leaves owned subprocesses running after cancellation |
| Retry a failed round with a fresh budget | Hides exhaustion and bypasses the person's decision |
| Claim live support from a fake executable | Exercises transport mechanics without proving the actual client |

## Verification

Synthetic independent Node processes exercise parallelism, cancellation, crashes, output/assignment failures and observed mutations. Stubbed native/sequential hosts share the same verdict/quorum as the process host. Compiled CLI tests place labelled fake clients on PATH; no real model or authenticated call executes.

## Sources

Recipes were checked against installed CLI help on macOS arm64 on 2026-10-19 and [Claude's CLI reference](https://code.claude.com/docs/en/cli-reference) and [Codex's command reference](https://developers.openai.com/codex/cli/reference/). These sources describe intended flags; actual conformance remains unverified.

[◀ Decisions index](./README.md)
