# 0118 — Owned candidate commits and current heads

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Independent QA binds HEAD and the actual candidate snapshot. The runner must pin a topic commit before QA, including a later repaired candidate, without using the personal checkout or synthesizing success from a message. The existing gate snapshot includes HEAD and index bytes; controlled staging intentionally changes those fields even when application files are unchanged.

## Decision

Add a bounded candidate-file observation separate from the existing gate snapshot. Hash actual regular file paths/modes/content, preserve empty/binary/Unicode data and omit deleted tracked paths consistently before and after staging. Derive the expected exact index stream using the repository's actual Git object format. Read raw Git bytes before UTF-8 decoding so invalid path bytes cannot be hidden by replacement characters. Existing gate snapshot declarations and hashes retain their meanings.

Retain only hashes/counts, never project file bodies, in controller records. Do not apply prose credential heuristics to this byte observation: an ordinary code reference such as `authorization: Readonly<Scope>` is not a credential. Existing source/metadata/artifact and commit-message guards remain unchanged. Continue refusing non-regular paths and enforce the existing candidate byte/file bounds.

Implement staging and commit as two separately journaled original-grant effects using the existing registered Git owner: code-write for staging and git-commit for the topic commit. Pin the exact source/plan/allocation/grant, original parent, candidate snapshot, file observation and validated supplied message. Require current private derived-plan acceptance and preserve the original budgets, repository prefix and state fencing. Reuse existing commit hygiene; no tool attribution, command substitution or forged human approval is introduced. Repository hooks/signing/helpers stay disabled in the controller because repository programs are untrusted; required checks remain separate contained QA/gate observations before publication.

Require actual original native closure and exact staged/file observations before applying staging. Before applying commit, additionally require the original single parent, clean index/worktree and the actual resulting owned HEAD. A built-in line-ending/encoding transformation that violates the raw byte pin is explicitly unsupported: retain its unknown staging result, preserve files and issue no commit or blind retry. External Git helpers remain refused. This reference boundary does not silently change project configuration or broaden Git execution.

Publish a small immutable controller receipt only after validating actual host-observed effect proofs. Keep its private head pointer separate from authority. The existing effect journal supplies the latest writer fence: pending/unknown work holds the workspace, and the latest applied candidate commit prevents an older receipt from restoring an old head even when its pointer is missing. Recover only the exact observed result without another Git invocation. Read-only reconciliation can repair that locator while leaving a paused run paused.

The workspace reader can now recognize the current privately observed committed head, including a repair. Actual working bytes still have their own snapshot; a commit or its receipt establishes no QA, human testing, acceptance or publication. Fixed domain-host/public run/reconcile/endpoint wiring remains P6-10 technical work.

## Alternatives rejected

Reusing the gate digest as the file observation would treat intended index/HEAD changes as content changes. Reconstructing invalid UTF-8 paths would lose identity. A privileged writer or a new arbitrary program launcher would duplicate the existing Git owner. Treating fixture provenance or a supplied receipt as authority would bypass actual observation. A second independent history/generation store would duplicate the existing effect journal and make crash recovery disagree about the current writer.

## Verification

Exercise actual staging/commit, deletion/empty/binary/Unicode/executable paths, SHA-1/SHA-256 object hashing, invalid UTF-8 index names, raw/index line-ending disagreement, current repairs and stale receipt fencing. Inject a failed private head write after the actual native commit, recover through a fresh controller without replay and keep paused execution paused. Reject changed inputs, pause/revocation, unsafe messages and fixture provenance before locator publication. Preserve the credential-heuristic failing repro and initial format findings. Complete checks pass 3044 tests in 145 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Eight model-free controls and inert schema parity also pass on Linux Node 20.0.0/Git 2.39.5. Models/accounts and full-route acceptance remain separate.
