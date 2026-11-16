# Release preparation — local evidence before activation

> **TL;DR** — Prepare offline package checks, native delivery previews, release-note drafts and a source consistency plan locally. A dispatched release pull request carries the version and changelog; merging it prepares the reviewed bundle, and publication waits only for the `release` environment approval, then is verified from the registry. Visibility, npm ownership and provenance stay the maintainer's setup.

> [!NOTE]
> **Status: ✅ implemented.** The release pull request, reviewed-bundle publication on merge and npm trusted publishing with provenance have run on GitHub. Post-publication verification passes against the published package in a clean container, and the optional release app has not opened a release pull request yet.

## Versions

Every version is a full semantic version, `x.y.z`; write `1.0.0`, never `1.0`. A pre-release adds an identifier such as `1.0.0-rc.1` and is published on the npm `next` dist-tag; a final version goes to `latest`. The first public release is preceded by `1.0.0-rc.1`.

| Change in the range | Version change it needs |
| --- | --- |
| A breaking change: a Conventional Commit with `!` or a `BREAKING CHANGE:` footer, a changed frozen contract, or a removed command, flag or behaviour | Major |
| A new feature (`feat`) | At least minor |
| Fixes, performance, reverts | At least patch |

What counts as breaking is the [compatibility policy](../extending/compatibility.md): version-one schemas are frozen, and removals follow the deprecation rules there. `wl release notes --from v<previous> --version <next>` computes the range's impact and refuses, with `needs-review` and exit 3, a version change smaller than it requires; release preparation refuses that draft. Before `1.0.0`, a breaking change needs a new minor version. A pre-release cycle (`1.0.0-rc.1` to `1.0.0-rc.2` or `1.0.0`) may carry any change, since the release is not final yet. A final version's notes start at the previous final version, so `1.0.0` covers the whole history and `1.1.0` everything since `1.0.0`, including what its candidates already listed. A pre-release starts at the version just before it.

`CHANGELOG.md` is generated from the same release notes by `npm run changelog` and checked by `npm run check`; never edit it by hand. A release pull request regenerates it with `npm run changelog -- --next`, which adds the untagged package version.

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

## Audit the history before it becomes public

`npm run scan:history` scans every commit of `main` with gitleaks, from a digest-pinned image in Docker with no network and the repository mounted read-only, so it adds no project dependency and cannot change the repository. It prints only rule, file, commit and line, never a match. Reviewed false positives are listed by fingerprint in `.gitleaksignore`, each with its reason; a fingerprint names a commit, so a history rewrite needs a new scan and review.

Run it before the repository becomes public and again on the final history immediately before the visibility switch. A real finding is resolved before publication: rotate the credential first, then decide with the maintainer whether to rewrite history. The same review covers personal data, local absolute paths, files over 1 MiB, fixture licences and neutral wording (no mention of the tools or work sessions behind the repository).

## Release through a pull request

The whole release runs in GitHub Actions; the maintainer's only release-specific action is approving the protected `release` environment.

1. Dispatch the [Release pull request workflow](../../.github/workflows/release-pr.yml) on the default branch with the exact version, such as `1.0.0-rc.1`. It sets the version in `package.json` and the lock, regenerates `CHANGELOG.md` with `--next`, refuses a version change smaller than the range needs, runs the full gate, then commits exactly those three files through the GitHub API and opens a pull request from `release/v<version>`. When the release app is configured (setup step 5), it opens the pull request with a short-lived GitHub App token and the required checks start on their own. Otherwise the workflow token opens it, and GitHub holds its `pull_request` runs until a maintainer approves them from the pull request's Checks tab.
2. Review and merge it like any other pull request.
3. The merge is a default-branch push that changes the package version to one without a tag. The [Release workflow](../../.github/workflows/release.yml) plans from that fact (any other push prepares nothing), runs all checks, reads actual repository metadata, prepares the reviewed bundle and uploads a seven-day artifact. Its summary links the exact artifact and an independently retained manifest digest. Inspect bundle.json, the notes and both archives.
4. Approve the `release` environment. Publication checks the immutable artifact ID/digest, selected core, all hashes and refreshed source/context. It installs no source dependencies and does not rebuild after approval.
5. A clean runner with Node 20 installs the published version from the registry into an empty prefix, waiting up to twenty minutes for npm to serve it, checks its dist-tag and runs `wl --version` and `wl doctor`. If that fails, the run marks the GitHub Release as failed and links [the recovery procedure](#recover-from-a-bad-release).

A manual dispatch of the Release workflow remains for a release whose version is already committed: version is that exact package version, from is the previous release ref (empty only for the initial release) and publish defaults to false, so a dispatch without it only prepares.

The maintainer completed these setup steps before `1.0.0-rc.1`; repeat them only for a new repository or package:

1. Approve public repository visibility explicitly, reserve/control the npm name, and commit explicit private false.
2. Configure the release GitHub environment with required maintainer approval and default-branch deployment restrictions. Verify the protection exists before merging a release pull request; an unprotected environment does not provide a review gate.
3. Configure npm trusted publishing for the exact GitHub repository, release.yml workflow and release environment, allowing `npm publish` (the workflow publishes directly after the environment approval) and not `npm dist-tag`. npm asks for a first publication through the connection within about two days to validate it, so create it right before the first release is merged rather than ahead of time. The GitHub-hosted publisher uses Node 24.22.0 with its bundled npm 11.19.1, checked before use, OIDC and explicit provenance. No npm token is written or required by any workflow. Initial npm ownership/reservation is a separate maintainer action.
4. Allow GitHub Actions to create pull requests in the repository settings, which the release pull request workflow needs.
5. Optional, to avoid approving the release pull request's checks each time: create a GitHub App owned by the maintainer, with no webhook and only the repository permissions Contents (read and write) and Pull requests (read and write). Install it on this repository alone. Create the `release-pull-request` environment, limited to the default branch. Set its `RELEASE_APP_CLIENT_ID` variable to the app's client ID and its `RELEASE_APP_PRIVATE_KEY` secret to a generated private key, read from standard input: `gh secret set RELEASE_APP_PRIVATE_KEY --env release-pull-request < key.pem`. Then delete the downloaded key file. Removing the variable returns the workflow to the workflow token.

Activation creates a non-overwriting tag for the reviewed SHA, creates a draft GitHub release with the exact notes/assets, publishes the reviewed npm archive and then finalizes the GitHub release. Stable versions use latest; prereleases use next and a prerelease GitHub entry. An existing tag stops the run even if its SHA matches. Publication across npm and GitHub is not atomic: failure may leave a tag, draft release or published npm version. Inspect those actual outcomes and reconcile manually before any retry; do not delete evidence or blindly rerun the workflow.

## Recover from a bad release

A published npm version is never unpublished or overwritten: unpublishing breaks every install that resolved it, and npm never allows the number again. A bad release is deprecated and superseded instead.

1. If the post-publication check failed, the GitHub Release already carries a caution, a "failed post-publication check" title and no Latest badge. Otherwise mark it the same way by hand.
2. Deprecate the version with the maintainer's npm credentials, naming the replacement: `npm deprecate wholeloop@<bad> "Broken release; use <next> or later"`. No workflow holds a credential that can deprecate; trusted publishing grants publication only.
3. If the bad version holds a dist-tag that users install by default, point the tag back at the last good version: `npm dist-tag add wholeloop@<good> latest` (or `next` for a pre-release).
4. Fix the cause on the default branch and release the next patch version, or the next pre-release, through the release pull request. Publication moves the dist-tag to it.
5. Record what happened in the journal and, when the cause is in the release process, amend the decision that owns it.

The native tar is a hosted release asset after successful activation. Download and extract that trusted release into a new local directory before registering its relative Claude marketplace or loading another native tree. The source repository root itself is not the generated marketplace. Remote Git marketplace registration and optional compiled binaries are not supplied by this workflow. Native installation from a downloaded release tree remains a manual check.

<!-- docnav -->
[◀ Authoring](authoring.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Nightly conformance ▶](conformance.md)
