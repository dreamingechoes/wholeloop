# Guard transport and scope

The core decides; native hooks and explicit Git fallbacks only move transient input. Read the versioned wholeloop/guard@1 result, never infer permission from prose.

- ⛔ `build-topic-commits` — Build commits use the active recorded topic workspace and branch. Pass the environment returned by build prepare/worktree open, including WL_SUBJECT, to builders. A subject without an allocation is denied.
- ⛔ `open-pr-publication-only` — pushes require the exact pending, approved, human-tested open-pr plan: clean snapshot, SHA, remote, repository and branch. No deletes, extra refs, stale code, unresolved decisions or history replacement.
- ⛔ `guard-bypass` — do not bypass configured guards. Recognized simple Git invocations with no-verify or hooksPath overrides are denied before execution.
- ⛔ `native-guard-preserves-permissions` — native allow produces empty output; retain the client's normal sandbox/permission checks. Deny uses its native shape. Missing, invalid or timed-out core results deny without raw payloads.
- ⛔ `opencode-native-dialect` — select native OpenCode execution from an exact observed version; default legacy rendering is unverified. V2 guards use the current session location, not the plugin load location; incomplete context denies. Do not substitute V1 flags or broaden permissions.

Use guard before-tool --stdin for native input; git-commit and git-push for actual Git events; state-write for explicit runtime destinations. The StoreFiles boundary still rejects runtime writes under every Git ancestor, including symlink targets. Native write/staged checks recognize reserved .wholeloop runtime paths; intentional project config and generated distribution files remain separate settings/output.

Install Git fallbacks explicitly with guard hooks install --repo path. The core and wrappers live in the external store. Existing executable hooks are chained at their original paths; guarded events are checked before and after them. Uninstall restores only the prior local override and retains the owned installation as a backup. Changed files/config, relative/multiple effective hooksPath values and worktree-only overrides need inspection/manual chaining; never silently overwrite them.

Claude and Copilot use command bindings; OpenCode uses a thin JS plugin. Codex CLI uses the Git fallback; desktop plugin hook support is not evidence of CLI support. Copilot outer timeouts can fail open, so the Git fallback remains necessary. These are cooperative hooks, not a shell parser or an adversarial sandbox. Compound shell programs, aliases and disabled hooks retain those native limitations. Payload fixtures do not prove activation in a native client. Verify each client/version and scope separately; one observed binding is not proof for another.
