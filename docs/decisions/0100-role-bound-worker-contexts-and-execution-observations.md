# 0100 — Bind fresh worker contexts separately from execution observations

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

A fresh native session needs enough exact context to work after interruption without inheriting another session's authority or hidden acceptance. A parseable model response cannot prove that a process ran successfully, that its files exist or that a criterion passed. The established read-only gate host must retain its narrower contract when delivery adds builders and research workers.

## Decision

1. Add independent closed assignment, result and controller-execution schemas for builder, verifier, reviewer, refuter, researcher, planner and challenger. Preserve all earlier declarations. Hash the full assignment, including exact run/plan/revision/role/attempt/generation, source, grant digest, environment references, repository candidates, criteria/findings/contracts, context, limits and deadline. Envelope planning/challenge may use revision zero; ordinary work requires a plan revision and unit. Supporting a schema role does not make its native host available.
2. Derive tools from the role, never worker JSON. Builders alone may write allocated implementation; reviewers/evaluators/researchers receive read-only repository access and narrower broker methods. Planner/challenger contexts have no implementation workspace or generic broker methods. Each role may produce its own output artifacts when the host supports that boundary. All workers disable ask-user and interactive tools, including supervised assignments: the controller owns any permitted human decision routing.
3. Assemble work contexts from the current queue lease, immutable plan/source and live private grant under the controller lock. Require a current finite reservation, pinned guidance and consumed contracts. Initial-envelope work additionally needs separately observed independent plan acceptance. Generate the brief from the actual source, selected criteria and assigned unit. Observe repository bytes; builder metadata requires a separate topic worktree of the same repository. A worktree establishes allocation, not filesystem containment.
4. Resume only explicit relative artifact references with exact bytes/hash, audience and optional attempt binding. Bound the whole resume pack to 1 MiB and reject traversal, aliases, wrong ownership, missing/changed bytes and recognized credentials. Hidden acceptance is private to its verifier attempt; it cannot enter builder/reviewer or shared context. Source/contract/guidance content remains data rather than an instruction to grant authority. Selection/classification is a trusted controller responsibility; hashing cannot infer whether arbitrary content is semantically private.
5. Bound assignment JSON to 2 MiB and response JSON to 1 MiB. Validate UTF-8, closed shape, complete exact identity, criterion scope and declared evidence references. Reject forged process, authority and human-testing fields. Do not repair a truncated response or wrap an unbound inner result. Worker output always retains origin worker-claim, including complete or pass declarations and explicit owned unknowns.
6. Stamp execution metadata separately from trusted host observations: exact backend/runtime, transport status, real exit when available, output digests, times and fixture/host provenance. Successful transport requires a zero exit, validated response, active exact ownership, unexpired deadline and bounded host reads of every claimed output artifact. Recheck ownership after those reads. Cancellation/failure may retain observations after authority expires without pretending that a result or exit existed. Execution receipts explicitly say acceptance not-established.
7. Expose contracts through delivery worker-schema; do not add a raw worker completion or process-receipt import command. Context preparation itself changes no state, launches no worker and creates no authority. Dedicated native hosts, staged directories, backend tool enforcement, model failures and actual filesystem containment remain P6-09/P6-12; complete runner/decision routing remains P6-10/P6-34.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Resume the last model conversation as the authority source | Can retain stale scope, private context or an old fence |
| Trust a worker's process/test/human-approval fields | Promotes a claim into controller or human evidence |
| Let each worker ask the owner directly | Breaks none mode and bypasses controller decision policy |
| Share all hidden scenarios across workers | Destroys independent acceptance and leaks evaluator inputs |
| Treat read-only prompt text as containment | Cannot prevent actual writes or credential access |
| Widen existing read-only gate launchers for builders | Changes their established permission and result contracts |

## Verification and limits

Role tables and hostile codec tests cover identities, tools, output bounds, context ownership, explicit unknowns and observation provenance. Disposable actual Git worktrees and files exercise current-lease assembly, guidance mutation, private-grant revocation and candidate snapshots. These checks do not certify a native model, a backend, semantic findings or actual read-only enforcement. Those remain separate observed acceptance obligations.

## Links

- [Worker protocol guide](../tutorials/delivery-workers.md).
- [Runner contract](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md).
- [Authority boundary](./0095-operator-grants-and-scoped-worker-claims.md).

[◀ Decisions index](./README.md)
