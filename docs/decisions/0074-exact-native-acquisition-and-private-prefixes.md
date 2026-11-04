# 0074 — Exact native acquisition and private prefixes

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The collector accepts exact versions and separate native paths but does not provision them. Installing a moving alias into a shared prefix could silently relabel a global client or modify personal configuration. Public installers also have different artifact layouts and integrity guarantees.

## Decision

- Add a pure versioned acquisition plan over bounded explicit download metadata. Validate unique CLI/channel pairs, exact versions, closed vendor/package/platform URLs and SHA-512 integrity. Support macOS and glibc Linux on arm64/x64; refuse other hosts. The CLI reads one regular bounded file and performs no installation.
- Keep I/O in a maintainer host. Resolve public npm pinned/latest metadata and the official Cursor installer/Antigravity updater without executing installer text. Require one unambiguous Cursor release and actual pinned npm versions; resolve all fourteen entries and validate the complete plan before creating an install.
- Default to a printed plan. Explicit installation requires a new absolute external destination; refuse repositories, including aliases into them. Use separate client/channel prefixes, private HOME/cache/temp directories, empty npm configs and a minimal credential-free subprocess environment. Never rewrite personal settings, shell profiles or global prefixes. This is isolation of configuration, not an OS sandbox for trusted vendor code.
- Download bounded HTTPS bodies without redirects or authentication. Check expected SHA-512 before installation, retain observed archive SHA-256 and preserve partial receipts after failure. Cursor's official installer provides no expected digest: preserve that gap instead of presenting a post-download hash as independent integrity. Exact top-level versions do not freeze transitive dependencies, vendor postinstall downloads or native auto-updates.
- Install verified npm archives into their exact private prefixes with vendor lifecycle scripts enabled: some native clients require them. Inspect installed package name/version and executable containment. For Cursor/Antigravity, bound compressed/decompressed sizes, preflight tar headers and the entire path/type inventory, and reject traversal, duplicates, links, devices, sparse/PAX metadata and unexpected roots before extraction. Accept Cursor's GNU long-name records. Require a regular executable and link only the expected private command.
- Commit reviewed pins as source policy, never runtime observations. Initial Antigravity artifacts use 1.4.3 and its four official updater SHA-512 values; the earlier local 1.4.2 availability probe does not establish 1.4.3 conformance. Leave native version probes to the collector immediately before each scenario; provisioning itself does not run a model or establish native acceptance.

## Alternatives rejected

Piping installers into a shell would execute moving setup code with the user's configuration. Installing latest directly would lose the exact version identity. Disabling all npm lifecycle scripts would leave some official native clients unusable. Shared prefixes could select the wrong channel. Treating Cursor's observed digest as a vendor checksum would claim evidence the installer lacks. An automatic cleanup/retry would hide partially installed external evidence.

## Verification

Exercise package/path/version/digest binding, all four logical platform mappings, whole-batch resolution and ambiguous/mismatched metadata with local fake downloads. Use actual host tar for tiny synthetic regular archives, refusal fixtures and private extraction; fake npm installation records arguments/environment and tests package identity, binary containment, checksum failure and partial outcomes. Compiled CLI tests check input bounds, linked-file refusal and empty HOME. Public metadata and archive-list probes do not execute native payloads. Linux execution, actual native installations/authentication/models and CI remain manual verification; logical mappings are not cross-platform execution evidence.

## Sources

- [Claude Code setup](https://code.claude.com/docs/en/setup)
- [Copilot CLI installation](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli)
- [Cursor's official installer](https://cursor.com/install)
- [Antigravity installation](https://www.antigravity.google/docs/cli/install/)

[◀ Decisions index](./README.md)
