# 0048 — Native target layouts and checked launcher roots

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Native clients do not share agent schemas or permission semantics. A portable
manifest also does not make every client discover its agent overlays. Skills need
their packaged core after installation or relocation without hardcoded home paths,
undocumented plugin variables or whichever executable happens to be on PATH.

## Decision

- Add Codex, OpenCode and Copilot renderers to the existing pure adapter interface.
  Prefix their skill/agent names with wl-. Enforce the skill name budget after
  namespacing; one canonical edit updates all target renderings and source hashes.
- Use Agent Plugins 1.0 root manifests for Codex/Copilot, with fixed skills/ layout.
  Put Copilot agents in its documented com.github.copilot/agents/ namespace. Codex
  TOML agents are project/user overlays under .codex/agents/, not a claim that a
  skills-only plugin loader discovers them. Emit onboarding only when setup exists.
  OpenCode uses its native .opencode/skills/ and .opencode/agents/ plus opencode.json.
- Give each non-Claude skill a tiny relative ESM launcher that imports the one
  packaged core. Resolve the artifact root in code from that core's actual URL,
  validate the ownership/version/core hash and recorded executable entry, and return
  it through adapter root. Directory symlinks and spaces do not require PATH guesses.
- Require the client-reported loaded skill directory; missing path/context becomes
  a question. The conductor passes the checked artifact root to agents. This keeps
  deterministic root resolution in code instead of asking a model to invent paths.
- Render native restrictions honestly. OpenCode observers deny shell/edit channels;
  Copilot observers receive read tools without shell/write tools and explicitly
  inherit repository instructions. Read access can include shared resources outside
  the checkout; writable OpenCode roles retain the native external-directory ask.
- Codex custom agents inherit parent permissions and cannot impose a separate
  read-only sandbox. Emit supported feature reductions and explicit checked-parent/
  headless guidance, never a fictitious per-agent sandbox_mode override. Permission
  enforcement, transient/ignored writes and actual tool behavior remain conformance.
- Inherit the selected model for the additional clients and retain canonical tier
  hints. Do not hardcode account-specific model availability. Claude keeps its
  existing native alias mapping. Keep all conformance fields unverified and hook
  registration unimplemented until the common guard is connected.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Reuse Claude's schema and variables everywhere | Other clients have different discovery, expansion and permission contracts |
| Treat all agents as portable Agent Plugins components | The portable schema covers skills/MCP; agent layouts are client-specific |
| Put sandbox_mode in a Codex custom agent | The parent permission policy is inherited; that field does not lower it |
| Copy the entire core into every skill | Duplicates the executable and creates version drift |
| Resolve relative paths in a prompt | A launcher/core can compute and verify the exact root deterministically |
| Claim complete native support from a listing | Does not establish permissions, independent workers or actual execution |

## Verification

Golden files pin the three native formats. Tests cover namespacing, closed portable
metadata, tool/permission mappings, a canonical change across four targets, compiled
launchers reached through directory symlinks, framing outside the artifact tree,
matching root manifests and corrupted/source-checkout root refusal. Native static
probe results and their partial-output limits are recorded separately; no model ran.

## Sources

Checked against official [Codex subagent contracts](https://developers.openai.com/codex/subagents/),
[plugin packaging](https://developers.openai.com/plugins/build/plugins),
[OpenCode agents](https://opencode.ai/docs/agents/), [OpenCode skills](https://opencode.ai/docs/skills),
[Copilot custom agents](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#custom-agents-reference)
and [Copilot plugin layouts](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
on 2026-10-19. The root manifest targets the published
[Agent Plugins 1.0 schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).

[◀ Decisions index](./README.md)
