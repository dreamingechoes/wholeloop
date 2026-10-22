# 0063 — Local Conventional Commit release drafts

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Distribution previews can be reviewed before public delivery is authorized. Release prose needs the same offline preparation path and authorship constraint. Copying complete commit messages would expose implementation details or historical trailers, while automatically choosing a previous tag would hide the release range.

## Decision

- Add release notes with an explicit from revision or initial history, optional ending revision and semantic version label. Resolve revisions to exact commit IDs and require the starting commit to be an ancestor of the ending commit.
- Read complete local history with bounded shell-free Git subprocesses. Refuse shallow/promisor clones, disable lazy fetching, prompts, signatures and optional locks, and retain neither subprocess diagnostics nor commit bodies in output. Bound the range to 1000 commits, subprocess output to 4 MiB and each message to 64 KiB; oversized or incomplete input fails rather than yielding partial notes.
- Share the existing Conventional Commit subject parser with commit hygiene. Group accepted subjects into breaking changes, features, fixes, performance, documentation and maintenance in history order. Detect breaking intent from the subject marker or standard body trailer, but copy only escaped subjects and commit identities into prose. Never copy commit bodies or author trailers.
- Report rejected subjects by identity and reason, without copying their text. Reuse the existing attribution detector on accepted subjects and final prose. A draft with rejected commits exits 4 and requires review; a clean draft exits zero, which does not establish publication readiness or runtime compatibility.
- Return a versioned JSON draft with pinned revisions, classification, counts and publication not performed, or Markdown on explicit request. Impact reflects commit declarations rather than verified compatibility. The version is a label: no file, package version, Git ref, tag, release or publication is changed.

## Alternatives rejected

Adding a changelog dependency would duplicate the established subject grammar for a small deterministic projection. Inferring compatibility or bumping a version from commit types would confuse declared intent with actual schema guarantees. Skipping malformed commits silently would make the draft appear complete. Fetching missing objects would make local preparation depend on credentials and remote availability; require a complete clone instead.

## Verification

Exercise shared grammar, classifications, breaking markers/trailers, subject-only output, attribution rejection, Markdown escaping, semantic labels and input bounds. Use a real temporary Git repository for exact initial/ranged/empty history, compiled JSON/Markdown output, invalid ancestry/ref refusal and shallow/promisor refusal. Verify files and refs remain unchanged. Review actual breaking intent, selected history and final publication prose with the owner before a release.

[◀ Decisions index](./README.md)
