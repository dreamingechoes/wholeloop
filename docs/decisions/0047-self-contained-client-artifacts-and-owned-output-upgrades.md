# 0047 — Self-contained client artifacts and owned output upgrades

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A plugin must work after leaving the source checkout and must invoke the same
core that supplied its canonical contracts. Generating directly into a user's
configuration would also mix a reversible build with installation, overwrite
local edits and imply client support before discovery has been exercised.

## Decision

- Embed bounded regular Markdown/JSON/YAML canonical resources at build time.
  Refuse symlinked or escaping inputs. Keep TypeScript host workflows in the
  bundled core rather than copying source imports that would be broken in a plugin.
- Render through an adapter interface into a pure path/content/mode tree. Start
  with Claude's documented plugin layout, skill front matter and agent tool/model
  mapping. Keep native conformance explicitly unverified and hooks unimplemented.
- Include the exact executable core, package version, source/core digests and all
  owned file hashes/modes. Plugin skills use the documented plugin-root substitution
  to invoke their bundled core. Agents receive the resolved root from the conductor;
  missing context becomes a question instead of silently running another wl on PATH.
- Map declared capabilities to explicit tools. Observers omit write tools and use
  native plan restrictions; roles with shell access still need actual client
  enforcement tests. Map canonical fast/standard/deep tiers to native model aliases.
  These are rendered settings, not evidence of permissions or independent sessions.
- Require an explicit output directory and offer a non-mutating dry run. Refuse
  unowned trees, changed/missing files, altered modes and unsafe links. Unchanged
  output is idempotent. Upgrade an unchanged owned tree through a staged directory,
  retaining its previous version at the exact backup path returned in the receipt.
- Separate generation from installation and runtime state. No client configuration,
  MCP credentials, hooks, journal or personal installation is modified by build.
  Generated distribution files may live in an explicitly selected repository output
  directory; item state and provider observations still live outside repositories.
- Keep guard hook registration as remaining code until the common guard exists,
  rather than distributing hooks that call a missing command. A successful static
  client validator does not close the actual installation/skill discovery criterion.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Read canonical files from the source checkout at runtime | Installed packages do not include that checkout |
| Let plugins call whichever wl is on PATH | Mixes versions and weakens pinned contracts |
| Copy unbundled workflow TypeScript | Leaves imports pointing to absent source modules |
| Overwrite a build directory blindly | Destroys local edits or unrelated files |
| Delete the previous output during an upgrade | Loses an inspectable recovery copy |
| Register hooks before their guard exists | Creates a plugin that fails at runtime |
| Treat static validation as live support | Does not exercise discovery, permissions or model execution |

## Verification

Golden fixtures pin rendered skills/agents/manifest. Temporary directories exercise
hash/mode ownership, idempotence, backups and refusal of edited/unowned/symlinked
output. Compiled CLI fixtures execute the copied core and begin framing outside
the source checkout. Claude 2.1.299 plugin validate --strict accepted a generated
manifest in an isolated temporary directory; no plugin was installed and no model
session ran. Client discovery/execution, hooks and Linux remain owner checks.

## Sources

Native structure and fields were checked against the official
[plugin manifest reference](https://code.claude.com/docs/en/plugins-reference),
[subagent reference](https://code.claude.com/docs/en/sub-agents) and
[skill variable reference](https://code.claude.com/docs/en/skills) on 2026-10-19.
Actual per-client conformance remains separate from these documented contracts.

[◀ Decisions index](./README.md)
