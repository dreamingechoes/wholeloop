# 0060 — Cursor observer workers and private native policy

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Cursor supports headless Ask mode and an explicit sandbox, but print mode also
supports write and shell tools. An observer must restrict tools, not depend on
instructions or a missing force flag. Ordinary wholeloop guards intentionally
permit approved Build actions; gate observers need a stricter boundary regardless
of the current workflow's approvals.

## Decision

- Invoke agent with print, JSON, Ask, enabled sandbox, an external worker workspace
  and the repository as an additional root. Emit no force, trust, resume,
  auto-review or MCP auto-approval flag. Keep native authentication in place.
- Extend recipes with optional named native policy artifacts. Stage only
  .cursor/cli.json and .cursor/hooks.json under the unique external worker,
  before client launch. Preflight the entire batch, bound each file at 64 KiB,
  use private directory/file modes and exclusive writes. Refuse symlink roots,
  parents and files, unknown paths, oversized content and existing output.
  Other recipes stage nothing. Credentials and prompts never belong in this map.
- Grant native Read patterns for the selected roots and deny Shell, Write,
  WebFetch and MCP. Reject path metacharacters with no documented literal escape
  rather than broadening permission patterns. Preserve personal/project settings.
- Add a worker-local version-1 preToolUse hook with failClosed. Its only allowed
  tool names are known read/list/glob/grep aliases. Deny shell, write/delete,
  web/search, MCP, delegation, memory, questions and unknown names. Require object
  tool input, absolute existing cwd and workspace roots contained in the selected
  repository/worker roots. Native tool schemas remain responsible for read inputs;
  the hook is not an independent proof of every file read's containment.
- Render this observer policy as a self-contained deterministic Node program in
  the core, not a prompt. Bind the actual Node executable and context as quoted
  literal data. Bound hook input to 64 KiB and waiting to five seconds; emit a
  static denial if Node fails. Empty read responses preserve native permission
  checks and other hooks; never emit an allow grant over a native denial.
- Decode only one native type=result/subtype=success/is_error=false JSON object
  with non-empty result text, then apply the existing assignment-bound envelope
  and gate validation. Keep process cancellation, snapshot checks and aggregation
  shared with the other recipes. Advertise headless in Cursor's local manifest.
- Setup failure starts no client. Policy staging is not crash-atomic; partial
  output stays in that failed external worker. Managed/native startup effects,
  hook discovery, permission merging, ignored/external changes, model execution
  and Linux remain owner conformance checks.

## Alternatives rejected

Rewriting shared CLI settings would change the owner's working environment.
Replacing HOME would disrupt native authentication. Ask alone does not describe
all print-mode permissions. Reusing ordinary workflow guards would authorize
actions inappropriate for observers. An unknown-tool allow fallback would admit
new native tools without review. Arbitrary artifact paths would let adapter setup
escape its worker or write unrelated files.

## Verification

Execute hook commands for read aliases and denied tools, malformed/oversized
input, bad roots and missing Node. Check private policy modes, whole-batch refusal,
preserved files and symlink/traversal/size edges. Run compiled Cursor dispatch via
a synthetic agent on PATH and inspect the policy visible to the actual child.
Installed Cursor 2026.07.16-899851b's pure native hook validator accepts the emitted
configuration and empty/deny responses without loading application dependencies.
This static probe and synthetic execution are not native model conformance.

Native contracts: [modes](https://cursor.com/docs/cli/using),
[permissions](https://cursor.com/docs/cli/reference/permissions),
[headless](https://cursor.com/docs/cli/headless) and
[final output](https://cursor.com/docs/cli/reference/output-format).

[◀ Decisions index](./README.md)
