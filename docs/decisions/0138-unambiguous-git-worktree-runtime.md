# 0138 — Unambiguous Git worktree runtime

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The README and doctor accepted Git 2.30 although existing ownership code requires newer metadata flags and NUL-delimited worktree listings. The manual verification record already noted a Git 2.30.2 failure; the installation contract had not been corrected. A fresh actual minimum-Node trial reproduces the mismatch before builder dispatch. Git 2.30 silently prints an unknown path-format argument and rejects worktree list -z. Its legacy porcelain output contains literal newlines in paths, making a line-based ownership fallback ambiguous.

## Decision

Declare Git 2.36 or newer consistently in installation documentation and doctor, which rejects older versions with its existing repair guidance. Git's [2.36 release notes](https://github.com/git/git/blob/master/Documentation/RelNotes/2.36.0.adoc) identify the introduction of NUL-delimited worktree listing to address unsafe path/reason encoding. Keep the existing unambiguous parser rather than adding a legacy line parser.

Resolve the common-directory output relative to the actual Git command cwd. This removes the unnecessary path-format dependency and preserves the same canonical shared database identity from primary roots, nested directories and linked worktrees. This read-only portability improvement does not certify old Git for worktree workflows. Node runtime compatibility remains a separate dimension: the actual minimum-Node control uses Node 20.0.0 with Git 2.39.5.

## Alternatives rejected

Continuing to advertise Git 2.30 contradicts actual runner observations. Parsing old newline-delimited worktree output risks ambiguous ownership when paths contain newlines; silently dropping such paths is also unsafe. Keeping the version flag while raising documentation alone leaves an avoidable cwd-resolution dependency. Inferring workflow success from doctor version metadata replaces execution evidence with a declaration.

## Verification

Retain the actual Git 2.30.2 two-command failure and literal-newline probe. Exercise doctor rejection below 2.36 and acceptance at the declared version boundary without claiming actual execution on an untested Git build. Execute real primary/nested/linked ownership with Unicode, spaces and newline paths; run existing workspace and owned Git regressions. Record actual runtime versions and results in the journal. Independent application-host and native-model acceptance remain separate.

The five-file regression passes 464 cases. The same final external control passes actual shared-directory and NUL ownership on macOS Git 2.49.0 and Linux Git 2.39.5/Node 20.0.0. Git 2.30.2 correctly fails the built doctor and unsupported listing while shared-directory reads succeed. Static/docs/package checks pass. These observations do not claim execution on Git 2.36.0 itself.
