# 0056 — Gemini hook roots through the native environment

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

ADR-0053 withheld native Gemini hooks because extensionPath substituted into a
shell command can execute path characters. The installed 0.27.0 implementation
also hydrates hook.env values recursively, then merges them literally into the
child environment. That separate data channel supplies the exact extension root
without shell interpolation, including linked and relocated installations.

## Decision

- Generate a BeforeTool extension hook whose command contains only a static,
  shell-quoted Node bootstrap. Put extensionPath solely in the native environment
  value WL_GEMINI_EXTENSION_ROOT. Never infer a root from PATH, cwd, a default
  installation directory or the first plausible package.
- Require an absolute environment root, regular bounded manifest/core files,
  the Gemini target and the exact embedded core hash before executing the guard.
  Missing/unresolved roots, malformed context or changed bytes deny with a fixed
  redacted reason. Integrity pinning does not authenticate a package publisher.
- Share only bounded transport/integrity/bootstrap logic with Antigravity. Keep
  each adapter's native schema and context binding separate; all tool policy
  remains in guard before-tool. Limit input to 2 MiB, allow five seconds for input
  and five seconds for the core, and use the native fifteen-second outer budget.
  A shell builtin emits a static deny if Node cannot start. Native timeout/failure
  behavior and policies still require actual client verification.
- Honor Gemini run_shell_command's actual dir_path before classifying Git
  operations. Ignore generic cwd/workdir arguments for that tool because Gemini
  does not execute in them. Preserve the other clients' existing normalization.
- Keep managed loose Gemini overlays on explicit per-repository Git fallback.
  Installing files does not activate an extension or register native hooks;
  shared settings remain untouched. Native extension trust/enablement and model
  interaction remain owner actions. This supersedes ADR-0053's omission of the
  generated hook, not its prohibition on unsafe shell interpolation.

## Evidence and limits

Authored tests invoke copied cores for normal/denied tools, relocated shell-special
paths, invalid roots/payloads, wrong target, changed core, oversized input, absent
Node and an unresponsive core. The installed Gemini 0.27.0 ExtensionManager hook
loader and HookRunner also accepted literal environment hydration and returned
allow/read and deny/runtime-write/push for a disposable extension, without running
models. The shell sentinel remained absent. That native API probe does not prove
full client activation, user permissions, inherited hooks or future versions.

## Rejected alternatives

- Quoting extensionPath inside command text: native substitution happens before
  shell parsing, so quoting cannot safely encode every future path.
- Guessing the default extension directory: linked extensions can load from another
  source, and multiple installations make inferred roots ambiguous.
- Rewriting shared user/project settings to activate loose-file hooks: existing
  ownership and native policy must remain explicit.

## Sources

The installed 0.27.0 ExtensionManager.loadExtensionHooks and HookRunner supply the
observed environment API. The official [hook reference](https://geminicli.com/docs/hooks/reference/)
and [extension reference](https://geminicli.com/docs/extensions/reference/) describe
the surrounding native contract; repeat against the intended installed version.
