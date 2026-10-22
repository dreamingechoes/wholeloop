# 0067 — Isolated offline npm package verification

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Copied-core tests do not exercise the npm archive, npm's bin links or the installed package's embedded resources. A local package can be tested before any public visibility, ownership, provenance or registry publication decision. Verification must not install into the owner's actual global prefix or native client home.

## Decision

- Add package:check and include its script after build/tests/smoke in normal check. Use the existing npm tool with the actual Node executable; resolve npm_execpath from npm scripts or the paired executable rather than hardcoding a tool prefix.
- Require the declared dist-only package and its sole built core. Inspect npm's dry-run file list before writing a tarball, then check the actual archive metadata against exactly LICENSE, README.md, package.json and dist/wl.mjs. Verify archive SHA-1/SHA-512 metadata and report SHA-256 for the observed local archive.
- Run npm offline with lifecycle scripts, audit, funding and update notices off. Use separate empty user/global configs, a disposable HOME/cache/prefix and a minimal environment without forwarding auth or Node configuration variables. Package scripts are not run by installation. No runtime dependency is permitted.
- Install the actual archive under that prefix. Check installed metadata/privacy, unchanged document/core bytes, executable bin links and both aliases' version. Run compiled help, then managed Codex user install, idempotent install and owned removal through the installed package to exercise its embedded canonical files. No native client, model, provider or credential store is needed for these checks.
- Verify source bytes remain unchanged. Remove only the successful disposable fixture; preserve a failed fixture with its explicit path and bounded generic subprocess diagnostics. Keep real user setup and external ownership untouched.
- Return a versioned local check receipt with platform/runtime and publication not performed. Preserve package privacy/version and distinguish this fixture from native discovery, fresh-machine timing, provenance or actual publication.

## Alternatives rejected

A copied-file smoke test misses npm's archive/link behavior. Installing globally without an explicit temporary prefix would change personal setup. Running lifecycle scripts or resolving dependencies online would turn a bundled-core check into an unrelated install/authentication operation. Checking the file list only after writing the archive would detect unexpected packaging too late.

## Verification

Execute npm pack dry-run and actual pack, verify archive digests, install the archive offline, execute both linked aliases and complete the owned installation round trip. Initial execution passed on macOS arm64, Node 24.1.0 and npm 11.8.0, retaining private true and version 0.0.0. Include the same path in the complete check; Linux, other supported Node/npm releases and physical interruption remain owner verification. No registry publication or native activation is implied.

[◀ Decisions index](./README.md)
