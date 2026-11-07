# 0068 — Read-only release consistency preflight

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

**Amended 2026-11-07 (P7-07).** Versions are full `x.y.z`, with pre-releases on `next` before a final `latest`. When `release notes` starts its range at a version tag, it compares the requested version with the range's impact: a breaking change needs a new major version (a new minor before `1.0.0`), a feature at least a minor one, and a pre-release cycle may carry any change until the release is final. A smaller change keeps the draft in review, and release preparation refuses it. `CHANGELOG.md` is generated from the same drafts by `npm run changelog` and checked by `npm run check`; it is never edited by hand. Rejected: a hand-maintained changelog, which drifts from the release notes and can carry wording no commit check has seen.

Offline delivery and notes can be prepared locally, but a publication workflow still needs a consistent package/version/commit/context before it can act. A package's privacy flag and imported CI fields are distinct from actual npm ownership, native acceptance or authorization. Ordinary Git status also hides assume-unchanged/skip-worktree paths and can invoke a configured filesystem monitor.

## Decision

- Add release preflight with an explicit version and bounded versioned CI context. Read regular non-symlink package/context files up to 64 KiB and a package lock up to 8 MiB. Retain only consumed metadata; omit raw contents and diagnostics.
- Compare requested, built, package, lock and root-lock versions/names. Require explicit package private false, supplied public repository metadata, exact case-sensitive GitHub repository URL, default-branch ref, explicit dispatch and the exact checked-out commit. Reject publication build metadata, retaining semantic draft labels separately. Derive latest/next tags without changing refs.
- Observe the actual checkout root with bounded shell-free Git. Ignore ambient worktree/index/object selectors so package metadata and Git cannot refer to different trees. Disable filesystem monitors, prompts, optional locks, lazy fetching and replacement objects. Refuse masked index flags instead of silently treating hidden paths as clean; preserve the user's flags and source files.
- Share the bounded Git reader with release notes and ignore replacement objects there too. A requested commit identity must describe its actual stored message, not local replacement prose. Keep complete-history/range/buffer limits unchanged.
- Return a versioned ready/blocked consistency plan with reason codes and exit zero/3; invalid input exits 4, unsafe/missing files or Git failures exit 3. Ready authenticates no imported context and grants no publication permission. It proves neither native acceptance, npm ownership, OIDC setup nor provenance. Perform no network call, source/version/visibility change, state write, ref/tag or publish.
- Append the new context/output identities and command to the v1 candidate only after verifying every old fingerprint/signature remains unchanged. Current coverage becomes 188 declarations, 145 commands and five exit codes.

## Alternatives rejected

Using a release-note version label as a source check would miss stale builds, private packages and mismatched locks. Trusting ordinary status alone would miss masked index entries. Refreshing flags or invoking the user's monitor would mutate or execute unrelated setup during a check. Treating caller-supplied CI JSON as authorization would turn consistency evidence into a permission bypass.

## Verification

Exercise ready, prerelease tags and each blocking condition, malformed/over-sharing context and unsupported versions. Run compiled ready/blocked/invalid paths in a temporary committed repository with conflicting ambient Git selectors. Refuse masked index flags, preserve files/refs and prove the configured monitor executes in a control call but never in preflight. Verify actual release messages despite replacement refs. A hypothetical private-context run on the actual working source returns blocked for package privacy, supplied repository privacy and current edits; that context is not an actual CI observation. Publication automation remains work.

[◀ Decisions index](./README.md)
