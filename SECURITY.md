# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately instead:

- through [GitHub private vulnerability reporting](https://github.com/dreamingechoes/wholeloop/security/advisories/new) (enabled since 2026-11-14), or
- by email to **[hi@dreamingecho.es](mailto:hi@dreamingecho.es)** with `wholeloop security` in the subject.

Include what you found, how to reproduce it, and the impact you expect. You will get an acknowledgement within five working days and a plan or a fix as soon as one is ready. Credit is given in the release notes unless you prefer otherwise.

## Scope

`wholeloop` runs inside agentic CLIs with access to your repositories, your shell and the providers you connect. Reports are especially welcome for:

- a way to make a step write, send, merge or toggle something its contract does not allow;
- a guard (`wl guard`, git hooks) that can be bypassed;
- state or configuration written inside a repository against [ADR-0004](./docs/decisions/0004-state-outside-the-repo.md);
- secrets leaking into the store, logs, generated files or provider calls.

## Supported versions

Until 1.0, only the latest release receives security fixes.

## Automated checks and their triage

| Check | Runs | When it reports | What to do |
| --- | --- | --- | --- |
| Bundled-dependency licences (`scripts/check-dependencies.mjs`) | Every `npm run check` and CI run | A bundled package outside MIT, ISC, BSD, Apache-2.0 and similar permissive licences, or a development tool outside the reviewed list | Replace the dependency, or record a reviewed exception with its reason in the script. Never widen the bundled list without a decision record. |
| Bundled-dependency advisories (`--audit`) | CI | A high or critical advisory in a package that ends up inside the CLI | Update or replace the package before the next release; if no fix exists, assess reachability and record it in the release notes. |
| `npm audit signatures` | The Signatures workflow on every push and pull request; reported, not required to merge | An installed package without a valid registry signature or attestation | Treat it as a supply-chain incident: do not release, find which dependency changed and why. The run prints the key, TUF and Sigstore lines of npm's debug log; since 2026-11-14 hosted runners have reported `EMISSINGSIGNATUREKEY` for `magic-string` 1.4.5 although its key is published as valid, so check that cause first. |
| Dependency review | Every pull request | A new dependency with a high-severity advisory or a copyleft licence | Choose another dependency or justify it in the pull request for the maintainer. |
| Dependabot | Weekly | An available update for npm packages or pinned actions | Review the changelog and let the full gate decide; update the version comment next to a pinned SHA. |
| CodeQL | Pushes, pull requests and weekly | A code-scanning alert | Confirm it, then fix it like any defect with a regression test, or dismiss it with a written reason. |
| OpenSSF Scorecard | Pushes to `main` and weekly | A lower score on a repository practice | Fix the practice when it is a real gap; record deliberate exceptions in the journal. |

A finding that could expose users is handled privately as described above, never in a public issue.
