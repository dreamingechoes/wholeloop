# 0220 — Retain closed private native output-failure categories

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The sixth actual implementation pilot passes plan production and its independent approval, then reaches a real builder. The process exits zero and changes only status.txt, but output validation fails. The existing receipt correctly retains only stdout/stderr digests and invalid-output, so the exact failed decoding boundary cannot be recovered from that historical response. The file also contains an extra newline and does not satisfy the pinned byte-level suite; neither partial work nor a successful process proves implementation success.

## Decision

Retain at most one fixed private output-diagnostic.json in the already owned native invocation directory after a decoding/attestation exception. Bind it to the exact assignment and stdout digest. Record only one closed phase (frame, proposal, result or execution) and an allow-listed static WorkerProtocolError problem. Unknown errors and unrecognized problem strings become unclassified. Never serialize exception messages, stacks, output bytes, provider text, source or credentials.

The diagnostic is metadata for investigation, not execution proof, acceptance or authority. Keep the public native receipt schema, existing validators, terminal verdicts, deadlines, budgets and ownership checks unchanged. A missing diagnostic cannot hide the original terminal failure; never reconstruct one for an earlier response whose category was not retained. Existing raw-output privacy and recognizable-credential rules continue to apply.

## Alternatives rejected

- Persisting raw rejected stdout or arbitrary exception messages could disclose data that validation deliberately refused.
- Inferring a specific historical cause from its digest would turn a hypothesis into a false observation.
- Relaxing decoding or accepting partial workspace edits would hide the failure instead of making it diagnosable.

## Verification

Pure controls retain known categories, reject unbound digests and omit arbitrary error/problem text. Actual synthetic native processes bind the diagnostic to their original rejected proposal and stdout receipt, while retaining the same failed verdict and zero captured artifact bytes. A new native attempt is still required to observe its own category; this feature does not reclassify prior failed pilots.

[◀ Decisions index](./README.md)
