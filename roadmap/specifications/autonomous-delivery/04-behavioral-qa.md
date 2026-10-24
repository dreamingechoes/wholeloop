# Behavioral QA and acceptance evidence

> **TL;DR** — Execute the approved behavior against the actual candidate and bind evidence to its bytes. Preserve unit/suite checks and adversarial review. Machine acceptance must be independently observable and must never impersonate a person's local testing.

> [!NOTE]
> **Status: 📐 design.** Accepted design target for P6-14–P6-17. Current testability checks and semantic gates remain required foundations.

## Acceptance plan

Proposed `wholeloop/acceptance-plan@1` maps every required criterion to one or more cases. A case names initial state, inputs/actions, observable assertions, failure conditions, runner capability, data fixture, timeout and `machine|human` ownership. Missing coverage or unsupported execution prevents completion and follows the intervention policy; none mode terminates blocked rather than waiting for a person.

Applicability is explicit and pinned before implementation. A non-UI CLI need not acquire a browser test; an applicable UI criterion cannot be relabelled inapplicable after a failed run. Human-only criteria remain pending until a person supplies their observation.

| Evidence | Required identity |
| --- | --- |
| Command/process | Exact argv/cwd, host run/attempt, start/end, exit/signal |
| API/CLI result | Request/input fixture, response/output assertion and observed endpoint |
| Browser | URL/origin, meaningful interactions, state assertions and runner/version |
| Artifact | External-store object digest/size/type, case, candidate and capture time |
| Semantic evaluation | Evaluator identity/assignment, rubric, supporting references and limitations |
| Human observation | Named person, exact candidate and actual note; never generated from machine evidence |

The controller records observed process facts. An agent saying “tests passed” is self-reported evidence until matched to a real host receipt. Process exit zero alone cannot establish criterion success.

## Execution sequence

1. Validate the plan, current authorization and environment readiness.
2. Observe the baseline and preserve pre-existing failures.
3. Execute the repository suite through its existing once-per-pinned-round contract.
4. Run behavior cases against the actual candidate application.
5. Give independent evaluators the criteria, scoped application access and relevant observed evidence.
6. Run existing verification/review and adversarial refutations on the same current revision; repairs repeat affected execution and both current build gates.
7. Seal a typed acceptance report; incomplete cases remain pending/failed/unavailable.

Execution evidence may be referenced by multiple verifiers; do not run the suite once per lens. Preserve interrupted suite intents instead of silently re-executing an uncertain command. Candidate changes invalidate earlier acceptance; dependency reuse follows the exact affected-input rules in integration planning.

## API and CLI behavior

Use declared native test commands or a reviewed deterministic host. Preserve argument boundaries, endpoint origin, fixture data and assertion shape. Support success and failure-path cases, persistence after restart and permission/error behavior where specified.

Do not normalize away material differences such as absent versus zero, wrong exit codes, partial responses or wrong tenant. Calls to services with possible mutations need an explicitly owned test environment and effect declaration. Keep vendor integrations fixture-tested unless actual operations are observed.

## Browser behavior

Reuse an available native browser tool or existing browser MCP/runner through a capability host. Do not build a browser automation framework or infer tool names from similar strings. Pin the selected tool schema, browser origin and effective capabilities.

Read the code and agreed criteria before planning paths; do not invent controls or navigation that the app lacks. Exercise meaningful user interactions. If a case requires clicking through a UI, injecting internal state or calling a hidden API is not equivalent evidence. Direct browser scripting is allowed only when the case explicitly tests that layer.

Capture labelled screenshots/traces/video only when they support an assertion. A screenshot is not proof of persistence or successful backend behavior. Bound individual artifacts to 20 MiB and a run's retained artifacts to 200 MiB by default; report truncation/omission rather than silently dropping a required case. Keep private artifacts external and redact before deliberate sharing.

## Independent acceptance and sensitivity

Builders cannot edit pinned acceptance definitions, required check configuration, evaluator policies or hidden case inputs. The controller mounts acceptance inputs separately into an evaluator/backend and exposes only needed outcomes to the builder. A same-user shared filesystem cannot claim hidden evaluation.

For a regression fix, execute the relevant test against an isolated baseline and then the candidate. Require an observed relevant baseline failure and candidate success when the plan marks red/green sensitivity applicable. New-feature baseline absence and pre-existing broken setup are different outcomes, not manufactured failures.

Offer bounded repository-native mutation tests where available; do not add a universal mutation dependency or claim semantic coverage from the existing constant-assertion scan. A model-generated evaluator is still a model: prefer deterministic assertions for objective outcomes and record uncertainty for qualitative judgments.

Proposed outcomes: `passed`, `failed`, `pending-human`, `unavailable`, `interrupted`, `stale`. Only complete current required coverage can yield delegated machine acceptance. Adversarial reviewers cannot refute an actual failed execution into success.

## Acceptance and tests

- [ ] **QA-01:** Missing criteria coverage, wrong candidate, forged process metadata and stale artifacts refuse acceptance.
- [ ] **QA-02:** A feature with a green unit suite but broken persistence/UI behavior fails a real behavior case.
- [ ] **QA-03:** An empty-title regression fails on the baseline and passes on the candidate with matching test identity.
- [ ] **QA-04:** A builder cannot modify hidden acceptance inputs or grant evaluator authority; validate the actual backend boundary.
- [ ] **QA-05:** Missing browser access, unsupported devices, timing failure and incomplete capture remain unavailable/failed, not passed.
- [ ] **QA-06:** A repaired candidate reruns required evidence; previous success and exhausted budgets remain historical.
- [ ] **QA-07:** Human-only criteria block automated publication even when all machine cases pass.
- [ ] **QA-08:** Artifact paths, retention, redaction and sharing reject symlink escape, oversized and credential-bearing metadata fixtures.

Tests include deterministic host fixtures, actual local CLI/API applications, an actual browser roundtrip and adversarial edits. Native tool/account acceptance is recorded separately by version.

[◀ Environments](./03-execution-environments.md) · [Integration ▶](./05-integration-and-change-impact.md)
