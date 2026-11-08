# 0049 — Shared guards and owned Git fallbacks

- **Status:** Accepted
- **Date:** 2026-10-19

**Amended 2026-11-08.** Codex 0.166 has stable project hooks (`.codex/hooks.json`, the same `PreToolUse` shape as Claude Code) and runs them only after the user trusts them; the trust is recorded per hook with a hash in the user's Codex configuration. Its real payloads are now fixtures that normalize like the other tier-A clients; it sends `apply_patch` text as `tool_input.command`, which the normalizer reads as the patch. wholeloop still registers no native Codex hook: a generated hook would do nothing until the user trusts it, and granting that trust is the user's decision, so the Git fallback stays the enforced path. Registering a trusted Codex hook is a separate decision.

## Context

Prompt rules cannot reliably bind a Git mutation to the exact Build workspace or approved publication. Native clients have different payloads, permission responses and timeout behavior. Installing a guard must also preserve the user's existing hooks and must not leave runtime files in a project.

## Decision

- Normalize bounded transient native JSON in the core. Keep commands, arguments, remote URLs and file bodies out of guard reports/errors and the journal. Ordinary read tools do not require journal access. Corrupt/missing required context denies.
- Bind Build commits to their active recorded workspace/topic branch. Carry WL_SUBJECT in prepared/opened environments so an attempted commit in the original checkout can be identified. The environment is context, not proof: validate the allocation. Ordinary unmanaged user commits remain allowed; do not guess the repository's default branch or impose wholeloop's commit style on other projects.
- Authorize only one non-delete update matching the pending open-pr request and its exact clean human-tested plan, repository, remote URL, branch, SHA and snapshot. Recheck inherited decisions, current gated evidence and known remote ancestry. Accept the producer's object-SHA local ref, not only a moving branch ref. No network/fetch occurs during guard evaluation.
- Keep the external-state writer boundary authoritative for runtime I/O. Native known write tools and Git staged paths additionally reject reserved .wholeloop runtime locations. Project settings/distribution output are intentional writes, not an exception allowing state in a repository.
- Render transport-only Claude/Copilot command hooks and an OpenCode JS plugin. Call an explicit Node executable rather than a native client's process.execPath. Empty success preserves native permission checks; native deny never auto-approves another tool. Inner bounded subprocess failures return explicit deny before the outer timeout. Copilot can fail open at its outer timeout, so keep Git fallbacks. Codex CLI has no verified native registration; desktop plugin hooks do not prove CLI support. Use the Git fallback rather than inventing a CLI configuration.
- Install fallbacks only through an explicit command. Copy/pin the built core and integrity-checked wrappers in the external store; point a local core.hooksPath override there. Chain existing executable hooks at their original absolute paths, not copied bodies. Check pre-commit/pre-push before and after prior hooks. Other existing hooks pass through. Bound each prior hook to thirty seconds.
- Record only prior local values separately from effective global configuration. Uninstall verifies owned files/config, restores those local values and retains the entire owned tree as a visible backup. Refuse relative/multiple effective or worktree-specific overrides and edited/partial installations for manual recovery. Do not steal locks, erase unrelated hooks or silently upgrade changed guards.

## Alternatives rejected

A universal shell parser would give false coverage of aliases, scripts and Git configuration. Recognize simple argv and known bypass flags only; actual Git hooks carry commit/push checks. Hooks remain cooperative enforcement, not a security sandbox against their user disabling them. Snapshot checks also cannot prove the absence of ignored, transient-restored or external effects.

Overwriting/copying existing hooks would change their paths, lose their semantics or duplicate private script contents. Pinning only the wholeloop executable on PATH would silently switch versions; use an owned core copy with a recorded hash instead. Automatic installation would change personal/project behavior without a concrete explicit request, so generation only emits native bindings and Git install is opt-in.

## Verification

Authored native/SDK fixtures are labelled synthetic, including the Codex-shaped normalization example. Execute generated bridges and real pre-commit/pre-push hooks on temporary repositories, including an SSH-shaped local bare transport with no network. Test exact approvals, wrong checkout, staged runtime, prior-hook mutation, original/global restoration, integrity/config refusal, malformed input and redaction. Actual native captures, permissions, outer timeouts, physical interruptions, Linux and other supported Node versions remain manual verification.

## Primary references

- [Claude hooks](https://code.claude.com/docs/en/hooks).
- [OpenCode plugins](https://opencode.ai/docs/plugins/).
- [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference), [plugin layout](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference) and [plugin-root environment release note](https://github.com/github/copilot-cli/blob/main/changelog.md).
- [Codex plugin surfaces](https://developers.openai.com/plugins/build/plugins).

[◀ Decisions index](./README.md)
