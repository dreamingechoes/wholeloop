# 0255 — Report registry signatures without requiring them

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

P7-05 added `npm audit signatures` to the CI job `check · ubuntu-latest · node 22`, which the `main` ruleset requires. From 2026-11-14 hosted Ubuntu runners failed it again and again with `EMISSINGSIGNATUREKEY` for `magic-string` 1.4.5. The failure persisted with the cache restored by `setup-node`, with an empty cache, and on a retry twenty seconds later.

The package is correctly signed. Its publish attestation names key `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`, which npm's TUF target `registry.npmjs.org/keys.json` lists as valid for signatures and attestations from 2025-01-13, with no end, as does the registry's own key endpoint. The same npm 10.9.9 under Node 22 and 24 verifies all 375 signatures locally, with a fresh or a warm cache.

The cause lies in what hosted runners receive and could not be observed from outside them. As a required check, it blocked every pull request, including the release pull request, on a condition that no change in this repository could resolve.

## Decision

By the maintainer's decision, registry signatures run in their own workflow, `.github/workflows/signatures.yml`, on every push to `main` and every pull request, as a reported check that is not required to merge.

- The run still fails with the audit's own exit status. Nothing retries it or turns a failure into success.
- On failure it prints the key, TUF, Sigstore and signature lines of npm's debug log, so the cause can be found. The job holds no token.
- A red run keeps its meaning in `SECURITY.md`: do not release until the failure is explained.
- The bundled-dependency licence and advisory audit (`check-dependencies.mjs --audit`) stays in the required check.
- `test/unit/ci/supply-chain.test.ts` enforces this:
  - `ci.yml` no longer runs the audit;
  - the Signatures workflow runs on pushes and pull requests;
  - it ends with the audit's status and has no `continue-on-error`;
  - its job is not among the required checks.

The CI retry and the empty cache tried first, in pull request #13, are superseded. The retry failed on both attempts, and the empty cache did not prevent the failure.

## Alternatives rejected

- **Keep it required and rerun until it passes.** That made every merge, and the release pull request with its npm validation deadline, depend on an external condition with no known end.
- **Remove the audit until the cause is known.** That would leave no automatic signature verification at all.
- **Pin around `magic-string`.** Its earlier versions carry the same kind of attestation, and doing so would hide a real signature fault if one appeared.

## Verification

`test/unit/ci/supply-chain.test.ts` and `test/unit/ci/contribution.test.ts` pass; the latter still requires exactly the checks `ci.yml` reports. A `bash -e` simulation of the step exits 0 when the audit passes, and exits 1 and prints the filtered log when it fails.

[◀ Decisions index](./README.md)
