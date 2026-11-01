# 0191 — Effect-boundary fault evaluation

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Unattended execution must fail safely at every boundary where it records or performs an effect: a controller can crash after preparing or issuing an intent, a response can be lost, a read can fail, a host can deny the action and authority can be withdrawn. Each case needs a retained result that shows no effect happened twice. Stale workers must not complete or publish, and unrelated runs must stay untouched.

## Decision

Add a systematic fault table over the real effect ledger and a synthetic remote that counts writes. It covers every ledger operation:

- `workspace.create`, `code.write`, `test.run` and `git.commit`;
- `git.push`, `pr.create`, `pr.ready`, `pr.update` and `pr.merge`;
- `report.write`.

Each operation runs under seven faults:

- a crash after prepare, recovered by a restarted ledger;
- a crash after issue, before invoke;
- a response lost after apply;
- a first read that is unavailable;
- a repeated observation;
- a denying host;
- revocation before issue.

Every cell must end in its expected state with at most one write, refuse a second issue, and leave the journal unchanged when re-observed. `npm run eval:runner-faults` runs the table and retains a report.

Unit cases add a fenced worker whose late completion and stale-attempt effect are refused while another run's events stay identical, and a checkpoint captured once across a restart. None-policy terminal behavior keeps its existing evidence: the public runner, research and engine cases end blocked without a prompt, and the foreground and process-recovery cases interrupt actual controller processes.

## Alternatives rejected

Sampling a few boundaries would leave untested combinations exactly where duplicates appear. Mocking the ledger would test the mock instead of the recorded semantics.

## Verification

- The unit table passes 70 cells and two scenario cases.
- `npm run eval:runner-faults` passed on the Linux x64 VM with 70 cells and no duplicate effect, and retained its report.
- The synthetic remote certifies ledger semantics only, not a hosted service or native client.
