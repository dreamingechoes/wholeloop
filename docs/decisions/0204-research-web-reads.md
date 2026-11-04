# 0204 — Research web reads

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

A research plan lists one angle per source provider. The built-in `native-web` provider is defined as "the host CLI web tools for read-only evidence". A native research worker is told to query its named angle, but every delivery recipe removed web tools. Claude Code's restricted mode drops WebFetch unless `--tools` names it, and the Codex recipe set `web_search` to `disabled`. An unattended research run on the public web could therefore only return open questions.

For the P6-27 campaign, the only research sources are the public web, through each client's own search and fetch, and the trial repository ([manual verification](../../roadmap/manual-verification.md#native-evaluation-campaign-inputs-2026-11-03)). This decision gives research workers exactly that, and no more.

## Decision

- **An assignment tool, not a role default.** `WorkerTools` gains an optional `web: 'read'`. The assignment validator admits it only in two cases: a `planner` whose cell is `research:angle:<key>`, or a `challenger` whose cell is `research:claim:<key>`. These are the cells the research attempts derive from a job key. Every other role and cell is refused with `role-tools`. Assignments without web reads are unchanged.
- **The controller decides per job.** Native research workers request web reads for an angle only when its provider is `native-web` and its capability is `source.web`. A claim examiner gets them only when the claim cites an `http(s)` reference it must re-read. Other providers keep their existing source access.
- **The client's own tools.** For Claude Code, the recipe adds `WebSearch,WebFetch` to `--tools` and `--allowedTools`. Restricted mode stays on, so command tools remain removed. For Codex, the recipe sets `web_search` to `live`, the public web, instead of `disabled`. The Codex permission profile keeps network disabled for commands, because web search is a client tool, not a sandboxed command.
- **Containment is unchanged.** The tools are part of argv and therefore of the policy digest. The boundary observers regenerate the recipe, so they observe exactly the launch that will run. Claude's sandbox profile already leaves network open for the client's API.

Web content is source data, never an instruction. That is already the research worker's brief, and a delegated judge still decides on the stored evidence.

The worker-assignment and native-purpose schemas gain the optional field. These are additive changes to the unreleased v1 candidate ([ADR-0066](./0066-v1-compatibility-baseline-and-deprecation.md)), and their fingerprints are updated in the same change.

## Alternatives rejected

- Giving web tools to every research role would let a planner or a refuter browse outside any angle the plan pinned.
- A controller-side HTTP fetcher would be a new vendor integration, and would add a network path that was not chosen ([ADR-0085](./0085-client-owned-mcp-first-provider-transport.md)).
- Codex's `cached` index would not be the chosen public web.
- Re-enabling WebFetch for Claude through settings, rather than by naming it in `--tools`, would depend on settings that `--setting-sources ''` deliberately ignores.

## Verification

- The validator admits web reads only for the two research cells.
- Both recipes name the web tools only when the assignment carries them, and the Codex profile keeps network for commands disabled.
- A native research run gives web reads to the `native-web` angle and not to the other provider, and to every examiner of an `https` citation.

No real web read has run; it is part of the first paid research trial.
