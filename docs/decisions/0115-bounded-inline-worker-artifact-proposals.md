# 0115 — Bounded inline worker artifact proposals

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Read-only workers can cite existing input artifacts, but producing a new report/plan artifact must not require broader workspace write tools. Existing file responses require exact artifact hashes and byte sizes; asking a model to calculate those facts introduces avoidable errors. The old worker-result and native receipt contracts must keep their meanings.

## Decision

Add an explicitly selected inline-proposal transport under a new wholeloop/delivery-worker-proposal@1 identity. Preserve file mode as the default, with identical existing recipes and v1 result/receipt declarations. The proposal echoes the exact assignment digest and supplies claim fields plus bounded artifact reference/kind/text. It supplies no identity override, runtime receipt, authority, human approval, hash or size.

Validate the echoed digest against the complete original controller assignment, then copy its known identity into a canonical v1 worker claim. Compute exact UTF-8 hashes/sizes in code and reuse existing role, criterion, finding, evidence, input-overwrite and artifact-budget guards. This conversion interprets a new explicit protocol; it never repairs a malformed v1 result or recovers identity from narrative. The host still observes original current authority, process closure, context and Git control separately.

Bound the complete decoded proposal to one MiB, at most one hundred artifacts and 256 KiB of combined inline UTF-8 text within the original assignment/run budgets. Preserve empty files, whitespace and Unicode exactly; refuse invalid encoding, NUL, unsafe references, unknown fields and recognizable credentials before capture. Capture validated bytes only through the existing persistent artifact budget and owned in-memory reader. A quota refusal remains a failure, not missing evidence silently accepted.

Keep native tools unchanged. Claude's read-only recipe needs no Write tool; Codex inline output roots become read-only while only the existing builder workspace retains write access. Policy hashes bind the selected response schema/permissions. There is no automatic protocol/model/client fallback. Current native runtime proof remains mandatory and unavailable by default; inline claims cannot establish QA, acceptance, publication or model certification.

## Alternatives rejected

Adding a privileged artifact-writer MCP server would introduce another authority/cancellation surface for data already available through an owned bounded response channel. Widening read-only workspace tools would weaken isolation. Silently repairing old responses would reinterpret a frozen contract. Model-supplied byte metadata would duplicate deterministic controller work. Treating the normalized claim as observed QA would erase the existing trust boundary.

Controller/provider integrations remain MCP-first. This decision changes only the worker's local artifact response transport; it introduces no service API or network implementation.

## Verification

Exercise exact UTF-8/empty bytes, stale assignment echoes, input/duplicate references, role/evidence expansion, aggregate limits and unsafe content. Run actual synthetic Claude/Codex processes producing inline artifacts without artifact files, retaining fixture provenance and existing file behavior. Complete checks pass 2969 tests in 140 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Five model-free runner controls and inert schema parity pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5. Actual native-model and full-route acceptance stay separate.
