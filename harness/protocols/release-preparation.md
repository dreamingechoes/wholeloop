# Release preparation

- ⛔ `release-bound-source` — compare exact package/build/lock/source/context before
  publication preparation. Refuse private/mismatched/dirty/masked source and keep
  Git selectors, monitors and replacements from relabelling it. A ready local
  consistency plan authenticates no CI observation and permits no publication.

- ⛔ `offline-package-delivery` — check the actual npm archive and installed bin
  links offline without lifecycle scripts or runtime dependencies. Preflight its
  file allowlist; isolate HOME/config/cache/prefix and managed-file checks. Preserve
  package privacy/version and report no publication or native acceptance.

- ⛔ `release-complete-local-history` — require an explicit initial or ancestor
  range pinned to exact local commits. Refuse shallow/promisor history and bound
  shell-free Git reads; do not fetch missing objects or return truncated notes.
- ⛔ `release-subject-only-draft` — share Conventional Commit subject parsing,
  omit bodies/trailers, escape prose and reject attribution. Report rejected
  identities without copying their subjects. Return a draft, never an implicit
  version change, tag or publication.

Commit types declare impact; they do not prove runtime compatibility. Review the
chosen range, breaking intent and final prose before explicit release activation.
Successful draft generation establishes neither native conformance nor readiness.
