# Release preparation — local evidence before activation

> **TL;DR** — Prepare offline package checks, native delivery previews, release-note drafts and a source consistency plan locally. Publication, provenance, visibility and actual native acceptance have their own activation boundary.

> [!NOTE]
> **Status: 🚧 partial.** Local packaging/delivery/notes/preflight are implemented. Package version 0.0.0 remains private; public hosting, publication workflow/provenance and actual release/tag/announcement remain open. These maintainer checks do not block local client setup.

## Select the source-built core

From the wholeloop source checkout with development Node 22 or newer:

```bash
npm ci
npm run build
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
```

Run npm run check for complete local verification. Keep runtime metadata and
prepared output in external temporary/store paths, then review the exact inputs
before explicit release activation. For your first native step, use
[local client setup](../platforms/local-onboarding.md).

## Check the npm package locally

```text
npm run package:check
```

This builds, checks npm's file list, packs offline and installs the actual archive
under a disposable prefix/HOME/cache with empty npm configs and lifecycle scripts
disabled. It verifies both bin links, versions, installed metadata/core bytes and
a managed Codex install/repeat/uninstall using embedded resources. The normal
check includes the same verification after its build/tests/smoke.

Successful fixtures are removed; a failure retains its path for inspection. Only
the four intended package files are allowed. Source bytes, package privacy/version
and personal setup stay unchanged. This is not native discovery, authentication,
model evidence, fresh-machine timing or publication. Current execution is macOS
arm64/Node 24/npm 11.8; repeat supported environments before claiming portability.
To keep an archive for your own local trial, create an external output directory
and run npm pack --ignore-scripts --pack-destination with that directory. See
[ADR-0067](../decisions/0067-isolated-offline-npm-package-verification.md).

## Review a local delivery preview

```text
node "$WHOLELOOP_CLI" release artifacts --out /tmp/wholeloop-delivery --dry-run --json
node "$WHOLELOOP_CLI" release artifacts --out /tmp/wholeloop-delivery --json
claude plugin validate /tmp/wholeloop-delivery --strict
```

The export contains all seven independent native trees plus a relative Claude
marketplace entry, each with the same built version/source/core. Root metadata
records file hashes/modes, local target summaries and publication not performed.
Version 0.0.0 remains a development preview. Static validation checks metadata;
actual installation/discovery and model conformance remain separate.

Dry runs render and preflight ownership without writing. Existing unowned,
changed, missing or extra entries are refused before idempotency/replacement.
Unchanged owned output reports already-correct; an owned upgrade retains its prior
tree in the returned backup. Interrupted filesystem replacement is not claimed
crash-atomic. Preserve unexpected output and choose a fresh directory.

To test registration yourself in an isolated real client configuration, use
claude plugin marketplace add /tmp/wholeloop-delivery and then
claude plugin install wholeloop@wholeloop. These commands change that client's
settings; export and validation do not register it. Remote installation requires
a hosted copy of the complete delivery tree and an explicit owner publication
choice. npm automation/provenance, compiled binaries and actual
public distribution remain P5-05 work. See
[ADR-0062](../decisions/0062-owned-seven-client-distribution-previews.md).

## Review release-note drafts

From a complete local clone, choose the range explicitly:

```text
node "$WHOLELOOP_CLI" release notes --initial --version 1.0.0 --json
node "$WHOLELOOP_CLI" release notes --from <previous-release-ref> --to HEAD --version 1.0.0 --markdown
```

The starting revision is excluded, the ending revision is included, and both are
resolved to exact commits in JSON. Initial mode includes all reachable history.
The semantic version is a draft label; omitting it uses the built core's version.
No version, file, ref, tag or publication changes. Shallow/promisor clones and
ranges over 1000 commits are refused instead of producing incomplete prose.

Notes group Conventional Commit subjects and detect declared breaking intent
without copying bodies or trailers. Attribution or malformed subjects produce
identity-only review entries and exit 4; a clean draft exits zero. Review the
exact range, actual compatibility and migration guidance before publishing.
Declared impact does not verify compatibility. See
[ADR-0063](../decisions/0063-local-conventional-release-drafts.md).

## Check release source consistency

Publication preparation has a separate read-only consistency check, run from the
wholeloop source checkout root:

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

Keep context outside Git; a future CI host obtains these fields from its actual
event/repository metadata. Preflight does not authenticate a supplied JSON file.
It compares versions with the selected built core/package/lock, explicit package
privacy, repository identity and visible source status. Masked index flags block;
inspect them or use a fresh checkout. Git monitors/replacements are not executed
or applied and ambient tree/index selectors cannot redirect the check.

Ready/exit zero means local metadata is consistent. Blocked/exit 3 names missing
conditions; malformed input exits 4, unsafe/missing files exit 3. Ready proves no
native acceptance, npm ownership, OIDC configuration, authorization or provenance.
No file, version, visibility, ref, tag or publication changes. The current private
development package remains blocked. Publication automation remains separate work;
see [ADR-0068](../decisions/0068-read-only-release-consistency-preflight.md).

<!-- docnav -->
[◀ Authoring](authoring.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Docs style ▶](docs-style.md)
