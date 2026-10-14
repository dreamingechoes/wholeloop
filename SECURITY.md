# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately instead:

- through [GitHub private vulnerability reporting](https://github.com/dreamingechoes/wholeloop/security/advisories/new) (enabled once the repository is public), or
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
