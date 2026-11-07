---
name: maint-prepare-release
description: Prepare a wholeloop release candidate locally - version, notes, preflight, package and bundle - stopping before anything is published. Use when the maintainer asks to prepare a release or check that the tree is releasable.
---
<!-- Generated from maintainer/ by npm run maintainer:render; edit the source instead. -->

# Prepare a release

`docs/contributing/releasing.md` is the procedure; this skill walks it and stops before publication.

## Versions

Versions are always full `x.y.z`, with pre-releases such as `1.0.0-rc.1` on the npm `next` dist-tag before a final release on `latest`. A breaking change never ships under a minor or patch version.

## Steps

1. Start from a clean, green tree: `VITEST_MAX_WORKERS=2 npm run check` ends in `CHECK PASS`.
2. Draft the notes with `node dist/wl.mjs release notes --from <previous tag> --to HEAD --version <x.y.z> --markdown`; read them for breaking markers and anything a user must do.
3. Write the release context outside Git as the release guide describes, run `node dist/wl.mjs release preflight --version <x.y.z> --context <file> --json` and resolve every finding.
4. Check the package with `npm run package:check`: it must contain exactly the files the release guide lists.
5. Review the delivery preview with `node dist/wl.mjs release artifacts --out <empty directory> --dry-run`.
6. Report the version, the notes, the package digest and anything still open in `roadmap/manual-verification.md`.

## Never

This skill never tags, pushes, publishes to npm, creates a GitHub Release or changes repository settings. Publication is the maintainer's single approval in the protected release environment.
