---
name: maint-triage-issue
description: Triage an issue or bug report against this repository - reproduce, classify, find the owning code, decision and roadmap task, and propose the next step. Use when someone shares an issue, a failing command or an unexpected result.
---

# Triage an issue

## Understand

1. Restate the report as observed behaviour versus expected behaviour, with the exact command, version (`wl --version`), client and platform. Ask for what is missing instead of guessing.
2. Never paste credentials, private repository content or full logs into an issue; summarise and redact.

## Reproduce

1. Reproduce with the smallest fixture you can, in a temporary directory, never in the reporter's repository.
2. If it does not reproduce, say what you tried and what differs.
3. A confirmed defect gets a failing test first; `npm run check:fast` shows it red before any fix.

## Locate

- Find the owning module under `src/` and its tests. Read the decision record that governs it (`docs/decisions/`) before judging the behaviour a bug: some refusals are deliberate.
- Search `roadmap/` for a task, known limitation or manual-verification item that already covers it.

## Classify

| Class | Meaning |
| --- | --- |
| Defect | Behaviour contradicts a documented contract or decision |
| Documented limitation | The behaviour is intended and written down; improve the docs if it surprised someone |
| Missing feature | Nothing promises it; it needs a roadmap task |
| Environment | Caused by the client, platform or service; record it in manual verification if it affects support |
| Security | Do not discuss details publicly; follow `SECURITY.md` |

## Propose

Give the class, the evidence, the owning code and decision, and one next step: a failing test to write, a doc fix, or a roadmap task with acceptance criteria. Do not change labels, assign people or comment on the issue unless asked; this skill never commits or pushes.
