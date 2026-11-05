# Expanded delivery acceptance map

> **TL;DR** — Every expanded delivery case has concrete local controls below. These links identify executable checks and hard-rule enforcers; they do not turn a fixture pass into native, hosted or cross-platform acceptance.

> [!NOTE]
> **Status: 🚧 partial.** All 86 declared cases map to executable local controls and registered hard rules. The docs gate rejects missing cases, invented controls and downgraded required evidence classes. Final-tree verification is recorded in the journal. Reference-client campaigns, hosted protection/merge trials and original release obligations keep their separate records.

## Read the evidence classes

Workflow/process controls use actual core/Git processes and explicitly synthetic clients or hosts. Backend/application evidence must name the actual application/backend, controller platform and daemon architecture. Native reference and hosted code-host evidence require their own retained real-client/service observations. A Linux container smoke is not a native macOS application trial.

The [validation specification](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md#evidence-levels) defines those classes. The [manual and native matrix](../../roadmap/manual-verification.md) retains the required external observations and unresolved original seven-client checks. Source installation and documentation do not waive them.

The rule names below resolve through [enforcement.yml](../../enforcement.yml); each referenced rule has its own concrete code/test enforcers. The test links identify available controls, not an assertion that a full native scenario has passed. Backend evaluation commands are opt-in and preserve their own failed/successful reports.

## Source-installable execution boundaries

Intervention policy and endpoint support are independent. `supervised` retains recorded human decisions; `on-exception` uses its declared delegations and records required exceptions; `none` admits only delegated decisions and reaches terminal blocked when a mandatory human or unavailable external prerequisite cannot be satisfied. Neither choosing a policy nor preparing a plan starts a worker, grants an effect or establishes an endpoint.

| Endpoint | Current source composition | Completion evidence |
| --- | --- | --- |
| `research-report` | Public controller, none policy, explicitly bound native runtime | Challenged sources and stored brief with explicit unknowns |
| `to-pr` | Public controller, none policy, explicitly bound native runtime, application recipes/suites and code-host adapter | Current committed product, fresh gates and exact ready PR |
| `to-merge` | Separately installed SDK composition; no public native-runtime merge flag | Independent installed allowance, exact grant, current CI/protection/feedback and observed merge |
| `local-handoff` | Installed SDK hosts; public composition unavailable | Exact committed local result and required acceptance |
| `learning-observation` | Installed SDK hosts; public composition unavailable | Grounded observation or proposal, with no automatic implementation |

A supervised/on-exception SDK implementation route additionally needs registered recorded-human hosts for its required plan/build-plan/acceptance stages. The current public factory supplies none and refuses that route before dispatch; ordinary supervised native skills remain available at their existing scope. Missing bindings, unsupported endpoints, unknown boundaries or absent hosts produce explicit preflight/outcome reasons rather than silently launching a broader fallback. Use [runner controls](../tutorials/delivery-runner.md) and [decision policies](../tutorials/delivery-decisions.md) for the exact commands and receipts.

Source builds, offline archive checks and generated doctor observations are local implementation evidence. The two reference clients, Claude Code and Codex, still require their own signed-in native/model campaign. The other four planned headless workers remain 1.x scope; Antigravity's unavailable headless transport and separate native harness obligations remain explicit in the [manual matrix](../../roadmap/manual-verification.md). Controller-owned credential injection remains an unaccepted proposal, not a documented installation requirement.

## Release obligations

This map does not close native case rows. P6-27 owns the remaining native/hosted campaign and P6-35 retains its account-measurement and maintainer design decision before credential implementation. Original seven-client harness/workflow, runtime/platform, publication and maintainer obligations remain in [V1 acceptance](../v1-acceptance.md) and the [manual matrix](../../roadmap/manual-verification.md). P5-07 cannot close before P6-32 and its original prerequisites. Npm/publication, hosted trials and release authorization are separate from a source install.

## Case map

### AUTH

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [AUTH-01](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [source.test](../../test/unit/delivery/source.test.ts) | `delivery-source-identity` | Local gate |
| [AUTH-02](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [source.test](../../test/unit/delivery/source.test.ts), [sources.test](../../test/unit/providers/sources.test.ts) | `delivery-source-identity` | Local gate |
| [AUTH-03](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [authority.test](../../test/unit/delivery/authority.test.ts), [worker-protocol.test](../../test/unit/delivery/worker-protocol.test.ts) | `delivery-operator-authority`, `delivery-worker-broker` | Local gate |
| [AUTH-04](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [decision-stages.test](../../test/unit/runner/decision-stages.test.ts), [human-feedback.test](../../test/unit/runner/human-feedback.test.ts) | `delivery-delegated-decisions`, `delivery-journal-replay` | Local gate |
| [AUTH-05](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Backend/application, Native reference | [authority.test](../../test/unit/delivery/authority.test.ts), [native-boundary.test](../../test/unit/delivery/native-boundary.test.ts), [native-scope-sandbox.test](../../test/unit/runner/native-scope-sandbox.test.ts) | `delivery-worker-broker`, `delivery-native-boundary-controls` | Local gate; native pending |
| [AUTH-06](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [authority.test](../../test/unit/delivery/authority.test.ts), [recovery-process.test](../../test/unit/delivery/recovery-process.test.ts) | `delivery-operator-authority`, `delivery-effect-reconciliation` | Local gate |
| [AUTH-07](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [compatibility.test](../../test/unit/contracts/compatibility.test.ts), [journal-replay.test](../../test/unit/delivery/journal-replay.test.ts) | `v1-declaration-compatibility`, `delivery-journal-replay` | Local gate |
| [AUTH-08](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) | Workflow/process | [plan.test](../../test/unit/delivery/plan.test.ts), [authority.test](../../test/unit/delivery/authority.test.ts) | `delivery-plan-contract`, `delivery-operator-authority` | Local gate |

### DEC

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [DEC-01](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Native reference, Hosted code host | [definition-stages.test](../../test/unit/runner/definition-stages.test.ts), [public-implementation.test](../../test/unit/runner/public-implementation.test.ts) | `delivery-delegated-decisions`, `delivery-public-runner-host` | Local gate; native and hosted pending |
| [DEC-02](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [decision-stages.test](../../test/unit/runner/decision-stages.test.ts), [acceptance-stages.test](../../test/unit/runner/acceptance-stages.test.ts) | `delivery-delegated-decisions`, `delivery-runner-decision-stages` | Local gate |
| [DEC-03](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [authority.test](../../test/unit/delivery/authority.test.ts), [decision-stages.test](../../test/unit/runner/decision-stages.test.ts) | `delivery-operator-authority`, `delivery-delegated-decisions` | Local gate |
| [DEC-04](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [stage-dispatcher.test](../../test/unit/runner/stage-dispatcher.test.ts), [acceptance-stages.test](../../test/unit/runner/acceptance-stages.test.ts) | `delivery-static-dispatch-preflight`, `delivery-recorded-human-decisions` | Local gate |
| [DEC-05](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [decision-stages.test](../../test/unit/runner/decision-stages.test.ts), [engine.test](../../test/unit/runner/engine.test.ts) | `delivery-delegated-decisions`, `delivery-static-dispatch-preflight` | Local gate |
| [DEC-06](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [decision-feedback.test](../../test/unit/runner/decision-feedback.test.ts), [revision-impact.test](../../test/unit/runner/revision-impact.test.ts) | `delivery-delegated-decisions`, `delivery-revision-adoption` | Local gate |

### RUN

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [RUN-01](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [queue.test](../../test/unit/delivery/queue.test.ts), [foreground.test](../../test/unit/runner/foreground.test.ts) | `delivery-queue-fencing`, `delivery-runner-ownership` | Local gate |
| [RUN-02](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [recovery-process.test](../../test/unit/delivery/recovery-process.test.ts), [process-recovery.test](../../test/unit/runner/process-recovery.test.ts) | `delivery-checkpoint-inputs`, `delivery-recovery-ownership` | Local gate |
| [RUN-03](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [fault-boundaries.test](../../test/unit/delivery/fault-boundaries.test.ts), [publication-stages.test](../../test/unit/runner/publication-stages.test.ts) | `delivery-effect-reconciliation` | Local gate |
| [RUN-04](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [recovery-process.test](../../test/unit/delivery/recovery-process.test.ts), [native-process.test](../../test/unit/runner/native-process.test.ts) | `delivery-recovery-ownership`, `delivery-runner-ownership` | Local gate |
| [RUN-05](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [native-process.test](../../test/unit/runner/native-process.test.ts), [native-scope.test](../../test/unit/runner/native-scope.test.ts) | `delivery-runner-ownership`, `delivery-parent-worker-deadline` | Local gate |
| [RUN-06](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process, Native reference | [native-host.test](../../test/unit/delivery/native-host.test.ts), [public-runner.test](../../test/unit/runner/public-runner.test.ts) | `delivery-native-host`, `delivery-static-dispatch-preflight` | Local gate; native pending |
| [RUN-07](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [worker-protocol.test](../../test/unit/delivery/worker-protocol.test.ts), [private.test](../../test/unit/acceptance/private.test.ts) | `delivery-worker-context`, `delivery-private-acceptance` | Local gate |
| [RUN-08](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Workflow/process | [budgets.test](../../test/unit/delivery/budgets.test.ts), [recovery-process.test](../../test/unit/delivery/recovery-process.test.ts) | `delivery-finite-budgets`, `delivery-recovery-ownership` | Local gate |
| [RUN-09](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) | Native reference, Hosted code host | [public-implementation.test](../../test/unit/runner/public-implementation.test.ts), [public-composition.test](../../test/unit/runner/public-composition.test.ts) | `delivery-public-runner-host`, `delivery-unattended-research-host` | Local gate; native and hosted pending |

### ENV

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [ENV-01](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Backend/application | [docker.test](../../test/unit/environment/docker.test.ts), [run](../../test/evals/delivery/run.ts) | `delivery-environment-runtime` | Local gate; backend records in manual matrix |
| [ENV-02](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Backend/application | [docker.test](../../test/unit/environment/docker.test.ts), [private-engine.test](../../test/unit/acceptance/private-engine.test.ts) | `delivery-environment-runtime`, `delivery-private-acceptance` | Local gate; backend records in manual matrix |
| [ENV-03](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Workflow/process, Backend/application | [recipe.test](../../test/unit/environment/recipe.test.ts), [docker.test](../../test/unit/environment/docker.test.ts) | `delivery-environment-recipe`, `delivery-environment-observation` | Local gate; backend records in manual matrix |
| [ENV-04](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Backend/application | [lifecycle.test](../../test/unit/environment/lifecycle.test.ts), [provision-control.test](../../test/unit/environment/provision-control.test.ts) | `delivery-environment-lifecycle`, `delivery-environment-private-cancellation` | Local gate; backend records in manual matrix |
| [ENV-05](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Backend/application | [docker.test](../../test/unit/environment/docker.test.ts), [recipe.test](../../test/unit/environment/recipe.test.ts) | `delivery-environment-runtime` | Local gate; backend records in manual matrix |
| [ENV-06](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Workflow/process, Backend/application | [environment.test](../../test/unit/environment/environment.test.ts), [recovery.test](../../test/unit/delivery/recovery.test.ts) | `delivery-environment-observation`, `delivery-checkpoint-inputs` | Local gate; backend records in manual matrix |
| [ENV-07](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) | Backend/application, macOS host, Linux host | [docker.test](../../test/unit/environment/docker.test.ts), [lifecycle.test](../../test/unit/environment/lifecycle.test.ts) | `delivery-environment-runtime`, `delivery-environment-lifecycle` | Local gate; backend records in manual matrix |

### QA

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [QA-01](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Workflow/process | [acceptance.test](../../test/unit/acceptance/acceptance.test.ts), [case-observation.test](../../test/unit/acceptance/case-observation.test.ts) | `delivery-acceptance-coverage`, `delivery-acceptance-observation` | Local gate |
| [QA-02](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Backend/application | [http.test](../../test/unit/acceptance/http.test.ts), [browser.test](../../test/unit/acceptance/browser.test.ts) | `delivery-behavior-execution`, `delivery-browser-execution` | Local gate; backend records in manual matrix |
| [QA-03](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Backend/application | [contract-gate.test](../../test/unit/verification/contract-gate.test.ts), [self-check](../../test/evals/delivery/self-check.ts) | `verify-test-sensitivity`, `delivery-evaluation-standards` | Local gate; backend records in manual matrix |
| [QA-04](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Backend/application, Native reference | [private-engine.test](../../test/unit/acceptance/private-engine.test.ts), [private-identity.test](../../test/unit/acceptance/private-identity.test.ts) | `delivery-private-acceptance`, `delivery-owned-private-product-qa` | Local gate; native pending |
| [QA-05](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Workflow/process, Backend/application | [browser.test](../../test/unit/acceptance/browser.test.ts), [browser-client.test](../../test/unit/acceptance/browser-client.test.ts) | `delivery-browser-execution`, `delivery-owned-browser-product-qa` | Local gate; backend records in manual matrix |
| [QA-06](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Backend/application | [verification-stages.test](../../test/unit/runner/verification-stages.test.ts), [repair-progress.test](../../test/unit/runner/repair-progress.test.ts) | `delivery-review-reentry-verification`, `delivery-original-verification-continuation` | Local gate; backend records in manual matrix |
| [QA-07](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Workflow/process | [acceptance-stages.test](../../test/unit/runner/acceptance-stages.test.ts) | `delivery-recorded-human-decisions`, `delivery-owned-feature-acceptance` | Local gate |
| [QA-08](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) | Workflow/process | [acceptance.test](../../test/unit/acceptance/acceptance.test.ts), [private.test](../../test/unit/acceptance/private.test.ts) | `delivery-acceptance-artifacts` | Local gate |

### INT

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [INT-01](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Backend/application | [assembly.test](../../test/unit/integration/assembly.test.ts), [integration-stages.test](../../test/unit/runner/integration-stages.test.ts) | `delivery-integration-assembly`, `delivery-current-assembly-qa` | Local gate; backend records in manual matrix |
| [INT-02](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Workflow/process | [plan.test](../../test/unit/delivery/plan.test.ts), [predecessor-readiness.test](../../test/unit/runner/predecessor-readiness.test.ts) | `delivery-plan-contract`, `delivery-qa-ready-predecessors` | Local gate |
| [INT-03](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Workflow/process | [revision-impact.test](../../test/unit/runner/revision-impact.test.ts), [unit-readiness.test](../../test/unit/runner/unit-readiness.test.ts) | `delivery-revision-adoption`, `delivery-stage-candidate-lineage` | Local gate |
| [INT-04](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Workflow/process | [continuation.test](../../test/unit/runner/continuation.test.ts), [revision-impact.test](../../test/unit/runner/revision-impact.test.ts) | `delivery-correction-continuation` | Local gate |
| [INT-05](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Workflow/process | [assembly.test](../../test/unit/integration/assembly.test.ts) | `delivery-integration-assembly` | Local gate |
| [INT-06](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Workflow/process | [merge-execution.test](../../test/unit/runner/merge-execution.test.ts), [feature-readiness.test](../../test/unit/runner/feature-readiness.test.ts) | `delivery-conditional-merge`, `delivery-whole-feature-product-readiness` | Local gate |
| [INT-07](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) | Workflow/process | [revision-impact.test](../../test/unit/runner/revision-impact.test.ts), [queue.test](../../test/unit/delivery/queue.test.ts) | `delivery-revision-adoption`, `delivery-queue-fencing` | Local gate |

### REL

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [REL-01](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Workflow/process | [publication-stages.test](../../test/unit/runner/publication-stages.test.ts), [authority.test](../../test/unit/delivery/authority.test.ts) | `delivery-authorized-publication`, `delivery-operator-authority` | Local gate |
| [REL-02](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Workflow/process | [ci-observations.test](../../test/unit/runner/ci-observations.test.ts), [merge-eligibility.test](../../test/unit/runner/merge-eligibility.test.ts) | `delivery-revision-bound-ci`, `delivery-merge-eligibility` | Local gate |
| [REL-03](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Hosted code host, Native reference | [ci-continuation.test](../../test/unit/runner/ci-continuation.test.ts), [ci-publication.test](../../test/unit/runner/ci-publication.test.ts), [ci-continuation](../../test/evals/runner/ci-continuation.ts) | `delivery-original-ci-failure`, `delivery-bounded-ci-repair`, `delivery-ci-correction-production` | Local gate; native and hosted pending |
| [REL-04](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Hosted code host | [merge-execution.test](../../test/unit/runner/merge-execution.test.ts), [merge-eligibility.test](../../test/unit/runner/merge-eligibility.test.ts) | `delivery-merge-eligibility`, `delivery-conditional-merge` | Local gate; hosted pending |
| [REL-05](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Workflow/process | [authority.test](../../test/unit/delivery/authority.test.ts), [merge-execution.test](../../test/unit/runner/merge-execution.test.ts) | `delivery-operator-authority`, `delivery-conditional-merge` | Local gate |
| [REL-06](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Workflow/process | [fault-boundaries.test](../../test/unit/delivery/fault-boundaries.test.ts), [merge-execution.test](../../test/unit/runner/merge-execution.test.ts) | `delivery-effect-reconciliation`, `delivery-conditional-merge` | Local gate |
| [REL-07](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Workflow/process | [authority.test](../../test/unit/delivery/authority.test.ts), [merge-eligibility.test](../../test/unit/runner/merge-eligibility.test.ts) | `delivery-operator-authority`, `delivery-merge-eligibility` | Local gate |
| [REL-08](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Native reference, Hosted code host | [merge-stages.test](../../test/unit/runner/merge-stages.test.ts), [merge-eligibility.test](../../test/unit/runner/merge-eligibility.test.ts) | `delivery-merge-route`, `delivery-merge-eligibility` | Local gate; native and hosted pending |
| [REL-09](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Workflow/process | [merge-execution.test](../../test/unit/runner/merge-execution.test.ts) | `delivery-conditional-merge` | Local gate |
| [REL-10](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) | Hosted code host | [merge-execution.test](../../test/unit/runner/merge-execution.test.ts) | `delivery-conditional-merge`, `delivery-merge-eligibility` | Local gate; hosted pending |

### OPS

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [OPS-01](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [budget-process.test](../../test/unit/delivery/budget-process.test.ts), [queue.test](../../test/unit/delivery/queue.test.ts) | `delivery-finite-budgets`, `delivery-queue-fencing` | Local gate |
| [OPS-02](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [budgets.test](../../test/unit/delivery/budgets.test.ts), [native-usage.test](../../test/unit/delivery/native-usage.test.ts) | `delivery-finite-budgets` | Local gate |
| [OPS-03](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [budgets.test](../../test/unit/delivery/budgets.test.ts), [native-usage.test](../../test/unit/delivery/native-usage.test.ts) | `delivery-finite-budgets` | Local gate |
| [OPS-04](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [repair-progress.test](../../test/unit/runner/repair-progress.test.ts), [budgets.test](../../test/unit/delivery/budgets.test.ts) | `delivery-observed-repair-progress`, `delivery-finite-budgets` | Local gate |
| [OPS-05](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [operator-report.test](../../test/unit/runner/operator-report.test.ts), [watch.test](../../test/unit/overview/watch.test.ts) | `delivery-operator-visibility`, `read-only-change-feed` | Local gate |
| [OPS-06](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [operator-report.test](../../test/unit/runner/operator-report.test.ts) | `delivery-operator-visibility` | Local gate |
| [OPS-07](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) | Workflow/process | [operator-report.test](../../test/unit/runner/operator-report.test.ts), [engine.test](../../test/unit/runner/engine.test.ts) | `delivery-operator-visibility`, `delivery-delegated-decisions` | Local gate |

### LEARN

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [LEARN-01](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) | Workflow/process | [scheduler.test](../../test/unit/learning/scheduler.test.ts), [learning.test](../../test/unit/learning/learning.test.ts) | `learning-scheduled-observations`, `learning-observation-runs` | Local gate |
| [LEARN-02](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) | Workflow/process | [observation-stages.test](../../test/unit/runner/observation-stages.test.ts), [impact.test](../../test/unit/impact/impact.test.ts) | `learning-observation-host`, `impact-explicit-unknown` | Local gate |
| [LEARN-03](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) | Workflow/process | [observation-route.test](../../test/unit/runner/observation-route.test.ts), [observation-stages.test](../../test/unit/runner/observation-stages.test.ts) | `learning-observation-host` | Local gate |
| [LEARN-04](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) | Workflow/process | [observation-stages.test](../../test/unit/runner/observation-stages.test.ts), [learning.test](../../test/unit/learning/learning.test.ts) | `learning-observation-host`, `learning-proposals-only` | Local gate |
| [LEARN-05](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) | Workflow/process | [maintenance.test](../../test/unit/learning/maintenance.test.ts), [maintenance-intake.test](../../test/unit/learning/maintenance-intake.test.ts) | `learning-maintenance-proposals`, `learning-maintenance-intake` | Local gate |
| [LEARN-06](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) | Workflow/process | [maintenance.test](../../test/unit/learning/maintenance.test.ts), [maintenance-intake.test](../../test/unit/learning/maintenance-intake.test.ts) | `learning-maintenance-proposals` | Local gate |

### RSR

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [RSR-01](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Native reference | [research-stages.test](../../test/unit/runner/research-stages.test.ts), [public-composition.test](../../test/unit/runner/public-composition.test.ts) | `delivery-unattended-research-host` | Local gate; native pending |
| [RSR-02](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [research.test](../../test/unit/research/research.test.ts), [research-stages.test](../../test/unit/runner/research-stages.test.ts) | `research-source-coverage`, `research-active-refutations` | Local gate |
| [RSR-03](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [research-web.test](../../test/unit/delivery/research-web.test.ts), [research-stages.test](../../test/unit/runner/research-stages.test.ts) | `delivery-research-web-reads`, `delivery-research-dispatch-boundary` | Local gate |
| [RSR-04](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [research-stages.test](../../test/unit/runner/research-stages.test.ts), [budgets.test](../../test/unit/delivery/budgets.test.ts) | `delivery-unattended-research-host`, `delivery-finite-budgets` | Local gate |
| [RSR-05](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Native reference | [research-stages.test](../../test/unit/runner/research-stages.test.ts), [authority.test](../../test/unit/delivery/authority.test.ts) | `delivery-research-dispatch-boundary`, `delivery-operator-authority` | Local gate; native pending |
| [RSR-06](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) | Workflow/process | [research-stages.test](../../test/unit/runner/research-stages.test.ts) | `delivery-unattended-research-host` | Local gate |

### EVAL

| Case | Required evidence | Concrete local controls | Hard rules | Current result |
| --- | --- | --- | --- | --- |
| [EVAL-01](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Native reference | [self-check](../../test/evals/delivery/self-check.ts), [public-implementation.test](../../test/unit/runner/public-implementation.test.ts) | `delivery-evaluation-standards` | Local gate; native pending |
| [EVAL-02](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Backend/application, Native reference | [browser](../../test/evals/delivery/browser.ts), [browser.test](../../test/unit/acceptance/browser.test.ts) | `delivery-evaluation-standards`, `delivery-browser-execution` | Local gate; native pending |
| [EVAL-03](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Backend/application, Native reference | [integration-stages.test](../../test/unit/runner/integration-stages.test.ts), [public-continuation](../../test/evals/runner/public-continuation.ts) | `delivery-current-assembly-qa`, `delivery-seeded-correction-workspaces` | Local gate; native pending |
| [EVAL-04](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Workflow/process | [fault-boundaries.test](../../test/unit/delivery/fault-boundaries.test.ts), [process-recovery.test](../../test/unit/runner/process-recovery.test.ts) | `delivery-effect-reconciliation`, `delivery-recovery-ownership` | Local gate |
| [EVAL-05](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Hosted code host | [fault-boundaries.test](../../test/unit/delivery/fault-boundaries.test.ts), [merge-execution.test](../../test/unit/runner/merge-execution.test.ts) | `delivery-effect-reconciliation`, `delivery-conditional-merge` | Local gate; hosted pending |
| [EVAL-06](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Native reference | [authority.test](../../test/unit/delivery/authority.test.ts), [native-scope-sandbox.test](../../test/unit/runner/native-scope-sandbox.test.ts) | `delivery-worker-broker`, `delivery-native-boundary-controls` | Local gate; native pending |
| [EVAL-07](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Native reference, Hosted code host | [ci-publication.test](../../test/unit/runner/ci-publication.test.ts), [ci-continuation](../../test/evals/runner/ci-continuation.ts) | `delivery-original-ci-failure`, `delivery-bounded-ci-repair`, `delivery-ci-correction-production` | Local gate; native and hosted pending |
| [EVAL-08](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Native reference, Hosted code host | [merge-stages.test](../../test/unit/runner/merge-stages.test.ts), [merge-execution.test](../../test/unit/runner/merge-execution.test.ts) | `delivery-conditional-merge`, `delivery-merge-eligibility` | Local gate; native and hosted pending |
| [EVAL-09](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Native reference, Hosted code host | [public-implementation.test](../../test/unit/runner/public-implementation.test.ts), [public-continuation](../../test/evals/runner/public-continuation.ts) | `delivery-public-runner-host`, `delivery-public-controller-bundle` | Local gate; native and hosted pending |
| [EVAL-10](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Native reference | [public-composition.test](../../test/unit/runner/public-composition.test.ts), [research-stages.test](../../test/unit/runner/research-stages.test.ts) | `delivery-unattended-research-host` | Local gate; native pending |
| [EVAL-11](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Workflow/process | [stage-dispatcher.test](../../test/unit/runner/stage-dispatcher.test.ts), [decision-stages.test](../../test/unit/runner/decision-stages.test.ts) | `delivery-static-dispatch-preflight`, `delivery-delegated-decisions` | Local gate |
| [EVAL-12](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) | Workflow/process | [observation-route.test](../../test/unit/runner/observation-route.test.ts), [maintenance-intake.test](../../test/unit/learning/maintenance-intake.test.ts) | `learning-maintenance-proposals`, `learning-observation-host` | Local gate |

## Remaining release boundary

A local complete gate must identify the checked commit, supported Node/runtime floor, actual test totals and offline archive/install result. Retain failed checks and narrower component smokes alongside the final pass. Record explicit commit-range validation before source release. This map grants no publication, model/account, credential, CI or merge authority.

Claude Code and Codex remain the 1.0 autonomous reference clients. Their required three-run campaign threshold and supervised regression remain separate from synthetic SDK composition. Gemini, OpenCode, Copilot and Cursor retain their original harness/native checklist and planned 1.x worker scope. Antigravity remains unavailable as a headless worker without a credential path; its in-session harness remains separate. Conditional merge still needs its separately installed runtime capability, an exact current grant and fresh host eligibility; the public runtime document does not install it.

P6-32 cannot close P5-07 or erase its original prerequisites. Publishing to npm, pushing this source or changing release authority requires its own existing authorization and accepted evidence.

<!-- docnav -->
[◀ Autonomous delivery design](../architecture/autonomous-delivery.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Core CLI ▶](../architecture/core-cli.md)
