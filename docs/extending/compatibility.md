# Compatibility — versioned contracts and deprecation

> **TL;DR** — The v1 candidate freezes existing schema declarations, step contracts, command signatures and exit codes. New commands and optional flags are additive; changing an existing format needs a new identity and a migration path. Commit classifications alone do not establish compatibility.

> [!NOTE]
> **Status: 🚧 partial — local v1 compatibility controls implemented.** The checked candidate covers 178 source JSON Schemas, 232 command-output variants, thirteen steps, 242 commands and five exit codes. Before the first release the six HTTP bridge configuration schemas were retired with their clients, and the planning outputs of `provider read-flags` and `launch dispatch` moved to `wholeloop/flag-read@2` and `wholeloop/dashboard-dispatch@2` rather than changing meaning under their old identities. The unreleased `wholeloop/delivery-plan@2` and `wholeloop/delivery-envelope@1` gained one optional field, the per-file manifest of a guidance pin; existing plans keep their meaning, but a reader built before that change refuses a plan that uses it. `wholeloop/release-bundle@1` gained the SBOM payload the same way, and the `wholeloop/release-notes@1` output an optional `bump` result. Runtime delivery generators validate their public manifests. Package 0.0.0 remains unreleased; native acceptance, release activation and announcement remain open.

## What is versioned

| Surface | Version boundary | Local check |
| --- | --- | --- |
| Config, provider/extension manifests, artifacts and event-data schemas | Explicit version-one identity or version field | Frozen declaration fingerprints and existing parser/workflow tests |
| Command JSON, including step preflights/receipts | wholeloop/name@1 discriminator | General schema registration and one baseline per output variant |
| Thirteen step definitions | Existing names, item kinds, sections, slots and decision boundaries | Individual step declaration fingerprints |
| Command syntax | Existing path, positional signature, schema and options | Existing signatures/options retained; new optional flags may be added |
| Exit codes | 0 success, 1 unexpected, 2 input, 3 precondition, 4 shape | Existing names/numbers retained |

Native client formats belong to their vendors. Their versioned conformance evidence is separate from wholeloop's schema identity; a frozen declaration cannot establish native loading, permission or model behavior.

## Changes during v1

- Preserve accepted legitimate inputs and existing output meanings throughout 1.x. Additive commands, opt-in providers and optional flags can ship in a minor release while existing declarations remain intact.
- Give changed formats a new versioned identity, retain the old reader during the current major line and document how callers select the replacement. Do not relabel old events, reinterpret an existing field or silently migrate state.
- A removal or intentional incompatible default needs the next CLI major and a documented migration. Declare deprecation in an earlier release and in the affected reference before removing it; include the replacement and migration steps. No current v1 surface is deprecated.
- Preserve external journals and ownership evidence. Any future migration is explicit, backs up the external store and describes rollback; an upgrade alone must not rewrite history. Unknown future versions remain refusal cases rather than guessed conversions.
- A bug fix may reject malformed input that violated a documented invariant. Record that rationale and regression evidence, preserving legitimate historical inputs. A feature label or Conventional Commit breaking marker is a declaration, not proof that these compatibility requirements have been checked.

## How the baseline is checked

The normal unit suite compares source declarations with test/fixtures/contracts/v1-baseline.json. Object keys are ordered canonically so formatting/key-order changes do not create drift. Arrays and all declared fields remain conservative fingerprints. The output envelope is separate from individual variants, so a new command does not change every existing variant's identity.

Every current declaration must have a recorded baseline entry; old entries cannot disappear or change silently. New identities are appended with their tests, not used to overwrite old definitions. Existing commands keep their positional and output contracts and all prior flags. Run npm run check after changing a contract; its source/compiled inventory check also catches missing general-schema branches.

A fingerprint change flags review; it is not a semantic compatibility proof. An annotation-only or equivalent edit may update its fixture after the reason and domain regression checks are recorded. Never refresh fixtures to hide changed constraints or meanings under an old identity. Parser, replay, workflow and native conformance evidence remain necessary for the behavior they exercise. The original compatibility increment ran on macOS and Debian Linux arm64/Node 24, including its 1925 tests, compiled fixtures and offline packaging. Later gates retain their exact candidate scope in the [journal](../../roadmap/journal.md). Other supported Node/platform combinations, real native clients and physical upgrade acceptance remain in the manual list.

## Delivery event extensions

The separate delivery journal preserves legacy item schema identities, human decisions and PR receipts byte-for-byte. Its frozen envelopes use independently versioned payload/facet families: validation requires both the envelope and a registered exact closed family schema/reducer. Add a new family identity rather than weakening or silently extending an old payload. Unknown versions refuse replay/writes; older readers are not promised to understand future delivery events.

Disposable delivery cache repair cannot recover private grants, erase revocations or migrate old human records. Recognizable future cache versions remain intact. [ADR-0096](../decisions/0096-replayable-delivery-journal-without-authority-recovery.md) documents the journal commit and compatibility boundaries.

## Before the actual release

Review the candidate against supported user workflows, migrations and release-note breaking intent. Finish native and fresh-machine checks, then activate publication through the maintainer's chosen channels. The fixture is a compatibility candidate, not a version bump, published package, tag or announcement. See [ADR-0066](../decisions/0066-v1-compatibility-baseline-and-deprecation.md).

<!-- docnav -->
[◀ Writing a provider](providers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Lenses, templates, profiles ▶](lenses-templates-profiles.md)
