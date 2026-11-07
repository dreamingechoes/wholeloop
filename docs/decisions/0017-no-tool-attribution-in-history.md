# 0017 — No tool attribution in project history

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

**Amended 2026-11-07 (P7-09).** Pull requests to `main` are squash-merged, so the title becomes the subject of the commit on `main`. The CI commit check validates the title with the same rules, beside every commit of the pull request, whose messages become the body. Branch and tag rules are versioned files, `.github/rulesets/main.json` and `.github/rulesets/release-tags.json`, which the maintainer applies to the hosted repository; a test keeps their required checks equal to the CI job names. The bootstrap line in `AGENTS.md` changes only when the maintainer announces the switch. Rejected: merge commits, which keep unreviewed intermediate subjects on `main`, and rules configured only in the hosting settings, which no review or test can see.

`wholeloop` is developed with the help of the very kind of agentic tools it supports. Many of those tools append attribution by default: co-author trailers in commits, "generated with …" footers in pull request descriptions, notes in changelogs. In a public project's history those lines are noise. They also tie the record of the project to a particular vendor, which goes against a harness meant to be CLI-neutral.

## Decision

1. **No tool or AI attribution anywhere in project history or content:**
   - no `Co-Authored-By` trailers naming a model, an agent or a tool;
   - no "generated with / made with" footers in pull requests, issues, releases or changelogs;
   - no such wording in docs or code.
2. **Conventional Commits** for every commit: `type(scope): subject`, imperative, ≤ 72 characters, body only when the *why* is not obvious.
3. **Authorship is the human author's** git identity.
4. **Enforced, not requested:**
   - a `commit-msg` check (added in [P0-06](../../roadmap/phase-0-foundations.md#p0-06--commit-hygiene-check)) rejects attribution trailers and non-conventional subjects;
   - the same check runs in CI on every pull request;
   - `AGENTS.md` states the rule for any agent working in this repository.

## Consequences

### Positive

- A clean, vendor-neutral history.
- A consistent, scannable log that can drive changelog generation.

### Negative

- Contributors must turn off attribution defaults in their tools; the check catches it if they forget.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Allow attribution, leave it to contributors | Inconsistent history; easy to forget |
| Strip trailers automatically on merge | Hides the problem instead of preventing it; rewrites authors' commits |

## Links

- Enforcement: `wl guard commit-msg <file>`, `.githooks/commit-msg`, `npm run commits:check` (PR range in CI). Human coauthors are allowed; attribution to tools is rejected. See [contributing](../../CONTRIBUTING.md#checks).
- [CONTRIBUTING](../../CONTRIBUTING.md) · [AGENTS.md](../../AGENTS.md)

[◀ Decisions index](./README.md)
