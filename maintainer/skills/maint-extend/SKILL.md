---
name: maint-extend
description: Add a provider, a coding-client adapter or a shipped harness skill to wholeloop following the authoring guide. Use when someone wants wholeloop to support a new service, client or step skill.
---

# Extend wholeloop

Read `docs/contributing/authoring.md` first; it holds the budgets, front matter and golden-file rules this skill relies on.

## A provider

1. Add `harness/providers/<id>/provider.json` and short guidance under `guidance/` (at most 30 lines each). Map only taxonomy operations, and give every operation a `degrade`.
2. wholeloop never talks to a service itself: access is the client's MCP server or a CLI the person installed (ADR-0085). Never add a network client to `src/`; `test/unit/providers/network-boundary.test.ts` fails if you do.
3. Add a synthetic fixture under `test/fixtures/providers/` and keep `remoteProbed` false.
4. Run `npm run providers:catalog`, then `npm run docs:references`.

## A client adapter

1. Implement the `Adapter` interface in `src/adapters/` (render skills and agents, paths, capabilities, manifest), with golden files and a conformance scenario.
2. State honestly in `capabilities()` what the client can enforce, especially read-only roles.
3. Add its install locations in `src/installation/plan.ts`, then run `npm run maintainer:render` so the repository's own tools reach the new client too.
4. Anything native and account-bound goes to `roadmap/manual-verification.md`, not into a ticked criterion.

## A shipped skill

1. Add `harness/skills/<name>/SKILL.md` within 120 lines, with name and description front matter.
2. Anything with one right answer belongs in `src/` with a test, not in the skill text. A hard rule (`⛔`) needs an enforcer in `enforcement.yml`.
3. Run `npm run harness:check` and update the golden files the adapters render.

## Finish

Use `maint-close-task`. Every addition is original work designed for wholeloop; do not port wording or behaviour from another project.

This skill never commits, pushes or changes repository settings.
