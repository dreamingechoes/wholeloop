# 0069 — Reviewed release bundles and explicit activation

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Local packaging, notes and preflight exist, but publication still needs a concrete
reviewable result. Rebuilding after approval would publish different bytes from
those reviewed. Native delivery contains hidden manifests and executable launchers
that ordinary artifact ZIPs can omit or change. An existing Git tag can also make
a release command's target argument ineffective.

## Decision

- Add a strict versioned bundle manifest binding repository, commit, workflow,
  version/tags, exact note range and four bounded payload hashes/sizes: npm archive,
  native tar archive, Markdown notes and the selected built core. A pure verifier
  requires the ready source preflight and an exact payload set. A read-only CLI
  also checks an independently retained manifest digest, regular files, selected
  core identity and current checkout/context. Reject unknown entries and redact
  failure diagnostics; this is consistency evidence, not publication permission.
- Prepare offline using the actual npm four-file allowlist/archive/integrity and
  existing complete-history notes and seven-client delivery generators. Use a new
  external directory, preserve unsuccessful output and never change source
  version/privacy/refs. Tar the complete native tree to retain dotfiles and modes.
- Add an explicit workflow_dispatch release workflow. Default to preparation only,
  read permissions, exact checked-out SHA, full checks and actual GitHub repository
  observations. Upload an immutable artifact and expose its ID, notes and separate
  manifest digest for review. Keep all expression inputs in environment data.
- Publication is a separate explicitly selected job behind the release environment.
  The owner configures its approval protection before activation. Download the
  exact artifact ID with digest mismatch errors, refresh actual context and check
  all prepared bytes/source. Do not rebuild or install source dependencies after
  approval. Bootstrap the payload core only after independently checking its hash.
- Use GitHub-hosted Node 24 and npm 11.8.0 with empty npm configs, no stored npm
  token and lifecycle scripts disabled. Grant OIDC and contents writes only to
  activation. Configure the exact repository/workflow/environment as an npm trusted
  publisher. Require public repository/package and explicit provenance publishing;
  actual ownership/OIDC/provenance remain owner verification, including initial
  package reservation. Do not change visibility or bypass initial ownership setup.
- Create the exact tag ref with a non-overwriting API operation before the draft
  GitHub release. Verify the tag exists, attach the reviewed assets/notes, publish
  the exact npm archive and only then finalize the release. Existing tags stop the
  run. Use latest for stable and next/prerelease otherwise. Do not retry or delete
  partial outcomes: tag, draft, npm and final release are not an atomic operation.
- Pin artifact actions by SHA to versions older than two weeks. Reuse existing
  checkout/setup-node pins; add no project dependency or npm credential file.

## Alternatives rejected

Publishing on every tag/push would hide the owner's explicit activation boundary.
Repacking in the publisher would invalidate review. Trusting a mutable artifact
name or colocated digest alone would not bind approval to exact bytes. Exporting
the native tree as loose artifact files would lose modes/hidden entries. Silently
reusing an existing tag could publish notes/assets against another commit. Automatic
rollback/retry across npm and GitHub could conceal an already published version.

## Verification

Test strict manifest/payload/context failures and actual offline preparation in an
external committed fixture. Extract the actual native tar and verify every mode
and hash, including hidden marketplace metadata. Run compiled verification against
changed digests/files, unknown entries and symlinks. Simulate GitHub/npm through
local logging executables, checking tag stdin, exact archive/provenance arguments,
failure ordering and no later finalization. Validate workflow structure, pinned
actions, data interpolation, permissions and no post-approval rebuild. Synthetic
host operations are not real GitHub, npm, OIDC, provenance or Linux evidence.

## Sources

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub reference creation](https://docs.github.com/en/rest/git/refs#create-a-reference)
- [GitHub release creation](https://cli.github.com/manual/gh_release_create)
- [Artifact upload v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)
- [Artifact download v8.0.1](https://github.com/actions/download-artifact/releases/tag/v8.0.1)

[◀ Decisions index](./README.md)
