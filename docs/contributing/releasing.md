# Release preparation — local evidence before activation

> **TL;DR** — Prepare offline package checks, native delivery previews, release-note drafts and a source consistency plan locally. Publication, provenance, visibility and actual native acceptance have their own activation boundary.

> [!NOTE]
> **Status: 🚧 partial.** Local packaging/delivery/notes/preflight and reviewed-bundle publication automation are implemented. Package version 0.0.0 remains private; actual public hosting, ownership/OIDC/provenance and release/tag/announcement remain unverified. These maintainer checks do not block local client setup.

## Select the source-built core

From the wholeloop source checkout with development Node 22 or newer:

```bash
npm ci
npm run build
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
```

Run npm run check for complete local verification. Keep runtime metadata and prepared output in external temporary/store paths, then review the exact inputs before explicit release activation. For your first native step, use [local client setup](../platforms/local-onboarding.md).

## Check the npm package locally

```text
npm run package:check
```

This builds, checks npm's file list, packs offline and installs the actual archive under a disposable prefix/HOME/cache with empty npm configs and lifecycle scripts disabled. It verifies both bin links, versions, installed metadata/core bytes and a managed Codex install/repeat/uninstall using embedded resources. The normal check includes the same verification after its build/tests/smoke.

Successful fixtures are removed; a failure retains its path for inspection. Only the four intended package files are allowed. Source bytes, package privacy/version and personal setup stay unchanged. This is not native discovery, authentication, model evidence, fresh-machine timing or publication. Current execution is macOS arm64/Node 24/npm 11.8; repeat supported environments before claiming portability. To keep an archive for your own local trial, create an external output directory and run npm pack --ignore-scripts --pack-destination with that directory. See [ADR-0067](../decisions/0067-isolated-offline-npm-package-verification.md).

## Review a local delivery preview

```text
node "$WHOLELOOP_CLI" release artifacts --out /tmp/wholeloop-delivery --dry-run --json
node "$WHOLELOOP_CLI" release artifacts --out /tmp/wholeloop-delivery --json
claude plugin validate /tmp/wholeloop-delivery --strict
```

The export contains all seven independent native trees plus a relative Claude marketplace entry, each with the same built version/source/core. Root metadata records file hashes/modes, local target summaries and publication not performed. Version 0.0.0 remains a development preview. Static validation checks metadata; actual installation/discovery and model conformance remain separate.

Dry runs render and preflight ownership without writing. Existing unowned, changed, missing or extra entries are refused before idempotency/replacement. Unchanged owned output reports already-correct; an owned upgrade retains its prior tree in the returned backup. Interrupted filesystem replacement is not claimed crash-atomic. Preserve unexpected output and choose a fresh directory.

To test registration yourself in an isolated real client configuration, use claude plugin marketplace add /tmp/wholeloop-delivery and then claude plugin install wholeloop@wholeloop. These commands change that client's settings; export and validation do not register it. Remote installation requires a hosted copy of the complete delivery tree and an explicit maintainer publication choice. The explicit workflow below prepares npm/native assets for public delivery; actual activation/provenance and optional compiled binaries remain separate. See [ADR-0062](../decisions/0062-owned-seven-client-distribution-previews.md).

## Review release-note drafts

From a complete local clone, choose the range explicitly:

```text
node "$WHOLELOOP_CLI" release notes --initial --version 1.0.0 --json
node "$WHOLELOOP_CLI" release notes --from <previous-release-ref> --to HEAD --version 1.0.0 --markdown
```

The starting revision is excluded, the ending revision is included, and both are resolved to exact commits in JSON. Initial mode includes all reachable history. The semantic version is a draft label; omitting it uses the built core's version. No version, file, ref, tag or publication changes. Shallow/promisor clones and ranges over 1000 commits are refused instead of producing incomplete prose.

Notes group Conventional Commit subjects and detect declared breaking intent without copying bodies or trailers. Attribution or malformed subjects produce identity-only review entries and exit 4; a clean draft exits zero. Review the exact range, actual compatibility and migration guidance before publishing. Declared impact does not verify compatibility. See [ADR-0063](../decisions/0063-local-conventional-release-drafts.md).

## Check release source consistency

Publication preparation has a separate read-only consistency check, run from the wholeloop source checkout root:

```text
node "$WHOLELOOP_CLI" release preflight --version 1.0.0 --context /tmp/release-context.json --json
```

The [context schema](../../src/release/schemas/context-v1.json) accepts only these fields:

| Field | Meaning |
| --- | --- |
| schema | wholeloop/release-context@1 |
| repository, public, defaultBranch | Repository slug, observed visibility and default branch |
| ref, commit | Exact CI branch ref and checked-out commit |
| event, workflow | Actual event name and workflow filename, including .yml/.yaml |

Keep context outside Git; the explicit release CI host obtains these fields from its actual event/repository metadata. Preflight does not authenticate a supplied JSON file. It compares versions with the selected built core/package/lock, explicit package privacy, repository identity and visible source status. Masked index flags block; inspect them or use a fresh checkout. Git monitors/replacements are not executed or applied and ambient tree/index selectors cannot redirect the check.

Ready/exit zero means local metadata is consistent. Blocked/exit 3 names missing conditions; malformed input exits 4, unsafe/missing files exit 3. Ready proves no native acceptance, npm ownership, OIDC configuration, authorization or provenance. No file, version, visibility, ref, tag or publication changes. The current private development package remains blocked. Publication activation remains separate from this local check; see [ADR-0068](../decisions/0068-read-only-release-consistency-preflight.md).

## Prepare a reviewed bundle

The maintainer host script is local preparation, using a complete clean source checkout whose package/build/lock and supplied context pass preflight:

```text
node scripts/check-dependencies.mjs --sbom /tmp/sbom.cdx.json
RELEASE_SBOM=/tmp/sbom.cdx.json node scripts/release.mjs prepare 1.0.0 /tmp/release-context.json /tmp/new-wholeloop-release <previous-ref>
```

The SBOM is a CycloneDX description of the packages bundled into the CLI, read from esbuild's metafile. The package declares no runtime dependencies, so `npm sbom` would describe nothing that ships. Preparation refuses an SBOM for another version and hashes it with the other payloads; it is attached to the GitHub Release.

Omit the final ref only for an explicit initial release. The destination must be new and outside source. Offline preparation writes the actual npm archive, a tar of all seven native trees including hidden files/modes, subject-only notes, the selected core and bundle.json with exact hashes/sizes/source/range. Preserve the reported temporary evidence on failure. Preparation changes no source/version/ref.

Retain the returned manifest SHA-256 separately from the bundle. Read-only verification uses the exact same core and current source/context:

```text
node "$WHOLELOOP_CLI" release verify /tmp/new-wholeloop-release --context /tmp/release-context.json --sha256 <retained-manifest-sha256> --json
```

This verifies bytes/source, not authorization or archive extraction safety for arbitrary third-party input. Unknown files, linked payloads, changed hashes/sizes, mismatched cores and blocked source/context fail with exit 3. Each regular payload is bounded to 128 MiB and the manifest to 64 KiB; failure output omits contents. The reviewed workflow generates both archives itself and never extracts imported untrusted trees. See [ADR-0069](../decisions/0069-reviewed-release-bundles-and-explicit-activation.md).

## Activate publication explicitly

The [Release workflow](../../.github/workflows/release.yml) supports manual dispatch on the actual default branch only. Version is an exact already-committed package version; from is the previous release ref, empty only for the initial release. The publish input defaults to false. Preparation runs all checks, reads actual repository metadata and uploads a seven-day artifact. Its summary links the exact artifact and an independently retained manifest digest. Inspect bundle.json, the notes and both archives before approval; simulated metadata is not a CI run.

Before requesting publication, the maintainer completes these release setup steps:

1. Approve public repository visibility explicitly, reserve/control the npm name, commit the reviewed version and explicit private false with its matching lock.
2. Configure the release GitHub environment with required maintainer approval and default-branch deployment restrictions. Verify the protection exists before selecting publish; an unprotected environment does not provide a review gate.
3. Configure npm trusted publishing for the exact GitHub repository, release.yml workflow and release environment. The GitHub-hosted publisher uses Node 24, npm 11.8.0, OIDC and explicit provenance. No npm token is written or required by this workflow. Initial npm ownership/reservation is a separate maintainer action.
4. Dispatch with publish true, inspect the prepared artifact/summary and approve that concrete bundle at the environment gate. Activation checks the immutable artifact ID/digest, selected core, all hashes and refreshed source/context. It installs no source dependencies and does not rebuild after approval.

Activation creates a non-overwriting tag for the reviewed SHA, creates a draft GitHub release with the exact notes/assets, publishes the reviewed npm archive and then finalizes the GitHub release. Stable versions use latest; prereleases use next and a prerelease GitHub entry. An existing tag stops the run even if its SHA matches. Publication across npm and GitHub is not atomic: failure may leave a tag, draft release or published npm version. Inspect those actual outcomes and reconcile manually before any retry; do not delete evidence or blindly rerun the workflow.

The native tar is a hosted release asset after successful activation. Download and extract that trusted release into a new local directory before registering its relative Claude marketplace or loading another native tree. The source repository root itself is not the generated marketplace. Remote Git marketplace registration and optional compiled binaries are not supplied by this workflow. Actual Actions, Linux, environment protection, npm OIDC/provenance and native installation remain manual verification; no publication was run during implementation.

<!-- docnav -->
[◀ Authoring](authoring.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Nightly conformance ▶](conformance.md)
