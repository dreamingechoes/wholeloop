# 0132 — Committed contract artifact observation

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Contract-only delivery units intentionally own no product criteria. Their declared deliverables already have identities, revisions and checksums, but no repository paths. Before independent QA can inspect those deliverables, the fixed controller must bind an explicit path selection to actual committed bytes. A filename, clean repository or worker claim alone does not establish that binding.

## Decision

Add an internal observeContractArtifacts reader for contract-only units. Require exactly the declared contract IDs, their original revisions/checksums/descriptions and an explicit repository-relative path selection. Require the actual root of a repository sharing the declared source's Git database and a commit descending from its pinned base. Refuse dirty candidates, unmerged indexes, untracked/ignored decoys, symlinks and nonregular index entries. Read bounded regular bytes through the existing safe source reader and compare their actual SHA-256 to each declared checksum.

Bound each file to 256 KiB and all unique observed files to 4 MiB. Distinct logical interfaces may share the same exact file; reuse that file's observation only inside this single audit, rather than imposing a new one-file-per-interface requirement. Take fresh candidate snapshots before and after reading and require unchanged clean state. Return the full declared identity vector and actual snapshot without file content. The reader writes no runtime state.

The result means mechanical identity matched. It explicitly establishes neither QA nor human approval, invents no product criteria and grants no execution or publication authority. The runner must separately bind the selected paths, original suite and independent verifier/refuter receipts before a contract-only verification stage can pass. That gate composition remains P6-10 technical work. Public contracts and existing criterion-verification requirements remain unchanged.

## Alternatives rejected

Inventing product criteria for a contract unit corrupts the approved ownership model. Trusting filenames or an asserted checksum ignores actual content. Checking only a clean commit permits the wrong bytes or an unrelated Git database. Reading a matching ignored file or symlink does not prove a committed deliverable. Enforcing distinct files rejects valid multiple interfaces represented by one schema. Reusing observations across audits conceals later changes. Treating matching bytes as semantic QA skips independent scrutiny and actual suites.

## Verification

Exercise exact matches, missing/extra selections, noncontract units, wrong checksums, dirty candidates, ignored matching decoys, committed symlinks, repository subdirectories, different Git databases, unrelated histories, genuine external worktrees, per-file/aggregate limits and shared-file interfaces. Preserve plan and frozen-contract regressions. Extend the finite model-free definition evaluation with actual external Git worktree observation and a changed clean commit. Record actual results and failures in the journal; do not infer complete contract QA or a working public route.

The final contract/plan/frozen-contract regression passes 475 cases, including fifteen new controls. All six complete model-free controls pass on macOS Node 24 and Linux Node 20.0.0 with identical bundled code. Preserve the initial fixture-base refusal; production base checks remain intact. Lint, types, build, docs, harness, Markdown, Mermaid and offline package checks pass.

[ADR-0133](0133-independent-contract-only-verification.md) joins this mechanical identity reader to independent contract-only gates and original suite observations; the reader itself still establishes no QA.
