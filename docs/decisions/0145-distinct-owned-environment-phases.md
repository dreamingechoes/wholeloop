# 0145 — Distinct owned environment phases

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A corrected candidate needs fresh application execution. The original root stage already owns an immutable environment scope. Overwriting that scope would lose its operation/nonces and invalidate historical suite evidence; sharing read identifiers across phases would confuse process ownership. Cancellation must still address original private owners after revocation or partial metadata loss.

## Decision

Permit an explicit digest namespace under the same root invocation for each later environment phase. Preserve the existing version-one locator and behavior when no phase is selected. Namespaced scopes use a separate exact version-two private binding that includes the phase, environment identity and original root-stage context. Retain consume-before-publish semantics, original deadlines, grant/plan validation, bounded operation counts and registered native effects. Include the phase in inert-read identities and operation claims so equivalent commands in different phases cannot alias owners.

Keep inspection exact to one original scope. Later phases cannot change what an earlier observation attests; there is no aggregate positive QA verdict. This is ownership plumbing, not authority to start another suite, select a fresh environment or pass a gate. Existing suite and verification stop handlers explicitly cancel all discovered original phases through their own private channels.

Root cancellation discovers only bounded digest-named private locators and consumption markers. A missing or malformed phase cannot authorize replacement work. Attempt cancellation of other known scopes before reporting unresolved cancellation. Revocation does not remove cancellation rights. Never signal stored PIDs, infer closure from a requested cancellation or prune Docker resources.

## Alternatives rejected

Replacing the original binding destroys provenance. Reusing inert-read identities aliases distinct processes. Restricting stop to the last phase leaves earlier owned work running. Treating all phases as one successful observation would incorrectly reuse old QA for corrected code. A global unbounded directory scan would make cancellation unpredictable.

## Verification

Environment/suite/verification/frozen regressions pass 450 cases in 164.55 seconds. A separate three-check process control passes on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5 using the same compiled code: preserve the original observation across a later phase, recover exact owners, refuse repeated dispatch and cancel other exact effects despite revocation and a missing locator. Restore the original metadata without replay. The fixture uses actual synthetic client processes with normalized environment records; it establishes no application readiness, actual Docker boundary, behavioral acceptance or independent Linux application-host certification. Fresh-suite composition remains technical work.
