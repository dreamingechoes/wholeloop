# 0088 — Version-specific OpenCode native transports

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The installed OpenCode is 2.1.1; the retained conformance pin is 1.17.9. V2
removes V1 headless flags and changes plugin registration and permission rules.
A V1 plugin function does not become a V2 plugin by moving its file. Replacing
the old target globally would invalidate the pinned native layout without testing it.

Actual V2 probes expose two more differences: a project-config inspector is not
discovered in the noninteractive worker, whereas an isolated global config loads
it; completed final text can be emitted without a terminal step_finish event.
Even --version initializes native caches/logs, so an ordinary probe breaks the
installer's promise that dry-run does not alter the user's home.

## Decision

Keep default build and explicit V1 rendering unchanged. Add adapter build-native
with an exact supported native pin. Managed installation observes the version in
a temporary child home; conformance uses its exact pin. Rendering remains pure,
with the version supplied as input. Unknown future major versions refuse rather
than selecting a guessed dialect. Inspection validates either known artifact by
bytes when no native version is available; integrity is not native compatibility.

V2 emits a default id/setup definition, registers execute.before through ctx.tool
and obtains the current session's location through ctx.session.get. Missing or
ambiguous session context denies; the plugin load location is not a fallback.
Share the existing checked core transport and recognize native patch destinations.
No SDK package dependency or per-service API implementation is added.

The V2 headless worker stages a non-secret global config under its own external
directory and points XDG_CONFIG_HOME there. It does not edit personal config or
use V1 flags/environment config overrides. A unique inspector denies everything
except the path-checked reader and its assigned external repository boundary.
Grep/glob stay denied because their permission resources are expressions/patterns,
not search paths. Native MCP and skill use are denied. Keep native/system policy
and provider/account choices; never broaden grants to obtain a passing gate.
Use the documented integration.use policy resources `mcp:*` and `skill:*`; unknown
action names are not enforcers. Artifact dialect detection refuses escaping or
root symlinks before reading a hint.

Select the headless dialect from an observed version before sending assignments.
Only after clean process exit, V2 accepts ended text belonging to the last step
and one consistent session/message identity. Reject partial, mixed, failed or
nonterminal output; a recovered terminal tool error is not an unfinished tool.
Decode at most one exact JSON Markdown fence around the completed final object,
with no surrounding prose, extra objects or other language. An actual diagnostic
lens returned such a wrapper; arbitrary text search remains forbidden. Preserve
the V1 stop-event requirement. The existing host
still validates exact assignment, run, round and result/vote schemas.

## Alternatives rejected

Switching every OpenCode artifact to V2 abandons the retained V1 pin. A hybrid
function/object export relies on undocumented loader behavior; the documented
dual server/setup object requires V1 1.18.29, newer than the pin. Guessing from an
empty native registry or exit zero mistakes preparation for activation. Accepting
arbitrary last text weakens completion detection; treating V1 environment flags
as V2 policy is not documented enforcement.

## Verification

Fixtures cover unchanged V1 trees, explicit V2 builds, managed installation and
doctor, isolated version side effects, session-location guard denial, patch paths,
staged read-only permissions, compiled dialect selection and strict final-stream
validation. Actual OpenCode 2.1.1 loads the global-config inspector and answers a
no-tool WL_READY probe and reads an assigned external synthetic README. An
isolated user-scope native V2 guard on core e601507c
allows the synthetic README read, denies a reserved runtime write with the core's
reason and leaves no file. This proves that binding in that configuration only.
The bounded six-lens source-API review attempt fails with five timeouts and one
invalid response; a separate longer lens attempt times out too. Preserve those
failures. A later bounded observation found ended text in a Markdown fence;
the V2 codec addresses that presentation only, with assignment/schema checks
unchanged. Project activation/trust, complete framing, actual gate verdict parity,
other native versions and Linux remain acceptance checks.

Sources checked 2026-10-22: [plugin migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1),
[plugin/session API](https://opencode.ai/v2/docs/build/plugins),
[configuration](https://opencode.ai/v2/docs/config),
[permission resources](https://opencode.ai/v2/docs/permissions),
[policy actions](https://opencode.ai/v2/docs/policies)
and [CLI commands](https://opencode.ai/v2/docs/cli/commands).

[◀ Decisions index](./README.md)
