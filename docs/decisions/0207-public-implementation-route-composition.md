# 0207 — Public implementation route composition

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

The controller bundle composes only the research route ([ADR-0205](./0205-public-controller-bundle.md)). P6-27 also needs each reference client to take a none-policy `to-pr` route from an authorized plan to an owned draft pull request. That route runs these stages:

- plan;
- acceptance definition;
- for each unit: workspace, build plan, implementation, commit, verification, review and re-verification;
- integration for each milestone;
- acceptance;
- publication;
- handoff.

Every stage has a fixed adapter, and each adapter is tested on its own. No code composes them into one host, and three inputs that the adapters need have no producer in the public path:

- **A unit's QA environment.** The verification adapter runs the declared suite in a Docker environment that is already ready for the unit's committed candidate. In tests that environment is provisioned before dispatch. The public path provisions none.
- **The suite selection.** That is which declared repository commands make up the unit suite, which recipe command runs each one, and their timeout. The suite refuses to guess a command.
- **The product inputs for integration.** [ADR-0173](./0173-fixed-product-environment-selection.md) left "creation of the candidate/assembly inputs" to later work.

Publication also needs the GitHub CLI. ADR-0205 rejected resolving a client through `PATH`, because any earlier directory could substitute a program.

## Decision

- **The runtime document names the machine's inputs, not authority.** `wholeloop/native-runtime@1` gains two optional fields:
  - `codeHost`: `{ kind: "github-cli", client }`, the absolute path of the `gh` binary that publication runs.
  - `repositories`: one entry per plan repository. Each entry gives the digest of an environment recipe already prepared in the store, a digest-pinned helper image, and the suite: the declared command refs, the recipe test command each ref runs (through a controller-owned acceptance case; see increment 4), and a timeout.

  Both fields are digested into the public host identity, so a changed recipe, image or binary is a different host. A runtime without them keeps its identity byte for byte.

  None of them grants anything. The plan's exact grant still decides which repositories may be touched and which effects may happen. The recipe store still refuses a recipe whose pinned inputs changed. The suite still runs only declared commands.
- **A unit's QA environment is prepared once per verification invocation.** This mirrors ADR-0173:
  - Before the first suite round, the verification adapter provisions the unit's environment through the existing `RunnerEnvironmentProducer`. It uses the repository's pinned recipe and the candidate fixed at the unit's committed head, in one fixed phase per invocation.
  - A recovered controller reads the original preparation result back; it never provisions again under the same invocation.
  - The suite selection names that environment and the acceptance plan pinned by the acceptance-definition stage.
- **Integration inputs come from the plan.** For each milestone the composer derives a `RunnerProductProduction`:
  - the milestone's units as integration inputs;
  - each unit's repair owner from the plan;
  - the recipe and helper image from the runtime entry of the milestone's repository.

  A milestone that spans repositories with different recipes is unsupported in this increment and stops at preflight.
- **Native roles come from the bindings, as for research.**
  - The planner and challenger run the acceptance definition, the build plan and delegated decisions.
  - The builder runs implementation, with file output and a writable workspace.
  - Verifier, reviewer and refuter run the gates, read only.

  Each role's launch goes through the fixed observer for its target, which regenerates the exact recipe that will run.
- **Publication uses the fixed GitHub host.** `GithubCliCodeHost` runs the runtime's `gh` binary instead of resolving `gh` from `PATH`. A route whose runtime has no `codeHost` stops at preflight.
- **Built in increments.** Every increment keeps the route unsupported until all of its stages are composed:
  1. The runtime fields.
  2. Unit environment preparation.
  3. Composition up to commit.
  4. Gates.
  5. Integration and acceptance.
  6. Publication.
  7. A complete synthetic end-to-end run.

  Until step 7, a `to-pr` route reports `public-host-unsupported-stage` before dispatch.

## Alternatives rejected

- **A separate environments document.** It would need its own CLI flag, retained bytes and identity term, but the result would be the same digest-bound configuration.
- **Putting recipes into the plan.** That changes the plan contract and its revision impact, for inputs the recipe store already pins and verifies.
- **Provisioning unit environments in a new route stage.** That changes every route digest. The verification invocation already owns the suite that needs the environment.
- **Choosing suite commands from repository guidance at run time.** The suite refuses to guess on purpose, so a guessed command would weaken that rule.

## Verification

Each increment adds its own cases. The runtime document rejects:

- a relative or unnormalized `gh` path;
- a repository entry with an unpinned image or a malformed recipe digest;
- a ref without a mapping, or a mapping without a ref;
- a duplicated repository;
- an out-of-range timeout;
- unknown fields.

A runtime without the new fields keeps its earlier identity.

### Unit environment preparation (increment 2)

`RunnerUnitEnvironments` prepares the environment. The verification adapter calls it before consuming the original round, and again for each correction round, using that round's correction receipt as the phase key. Three unit cases cover the refusals:

- a substituted or foreign-store preparer;
- an unconfigured repository, refused before the round is consumed and with no backend call;
- a round key that is neither `original` nor a digest.

A new scenario in `npm run eval:runner-verification` runs real Docker:

- the verification invocation provisions its own environment from a prepared recipe that was left unprovisioned;
- the placeholder environment in the caller's selection is replaced;
- the suite and the synthetic verifier pass;
- a recovered controller in a fresh store object passes again without another provisioning call;
- the environment is then retired.

The existing `observed-pass` and `observed-fail` scenarios still pass with the changed fixture.

### Composition up to commit (increment 3)

The composer now builds a `to-pr` dispatcher with these adapters:

- plan;
- acceptance definition;
- Git workspace and commit;
- build plan, with its delegated `approve-build-plan` decision;
- implementation.

Each binding's launch goes through its fixed observer. The builder's observer is built for the unit workspace, so it regenerates the writable recipe. Guidance pins become worker context only when each one names a file in a plan repository whose bytes, read at the pinned base commit, match the pinned digest. Any other pin leaves the route unsupported. Verification and every later stage have no adapter yet, so the dispatcher reports the route unsupported before dispatch.

The cases:

- **Coverage.** Exactly the six front stages are covered. Preflight is unavailable. A missing builder binding, or a pin whose bytes differ, composes nothing.
- **End to end with a synthetic client.** It runs through the real `CodexBoundaryHost` and executes plan, acceptance definition, workspace, build plan, implementation and commit. All six pass and the builder's edit is committed. Each of the five launches is preceded by two sandbox controls and one login check.
- **Mutation.** If the builder's observer is built without its workspace, the implementation launch is refused.

### Gates and controller suite cases (increment 4)

Verification, review and re-verification are composed. One binding must cover `verifier`, `reviewer` and `refuter`, and the gates launch read only through the fixed observer built for the unit workspace.

Each gate's flow engine is configured only from a file the composer writes into the store:

- `verify.suite` is bound to the runtime's first suite ref;
- `review.rubric` is bound to the plan's pinned rubric file.

The engine's home is an empty store directory. Neither discovery ambiguity nor the owner's own configuration can choose a rubric or a suite.

The real Docker run showed that a suite ref does not run a recipe command directly. It names an acceptance case, a `cli` case that runs one recipe test command and asserts exit zero. A run revision has exactly one acceptance plan, pinned before any builder, so those cases must be in the plan the acceptance-definition stage pins.

The acceptance-definition stage therefore takes optional controller cases. When it pins the produced plan, it appends them, and a produced case with the same id refuses the plan. The composer derives one case per declared suite command from the pinned recipe:

- the case id is the recipe command id;
- the command runs in that command's service;
- the criteria are the plan's machine criteria;
- the timeout is the suite's, because the case also covers container setup.

The planner's brief lists these cases as controller-owned. A command the recipe cannot back, or an id the case contract does not allow, leaves the route unsupported.

Two alternatives were rejected:

- **Asking the model to copy the cases.** The unit suite would then depend on model compliance.
- **A separate suite plan.** The acceptance store allows one plan per revision.

Verification:

- **Unit cases.** The appended plan pins with both cases, and a produced case with the controller's id blocks the plan. If the explicit collision check is removed, the plan is still refused as a duplicate case; the check only makes the reason specific.
- **`npm run eval:public-implementation`.** It runs real Docker and a synthetic client behind the real Codex observer. All nine stages from plan to re-verification pass: twelve launches, each preceded by two sandbox controls and one login check. The unit verification provisions one environment and the re-verification attests the same head without another, after which the environment is retired.
- **The first Docker run found the case-timeout defect.** A case limited to the command's own 5 s was cancelled during container setup.

### Integration and acceptance (increment 5)

The composer derives one product production per milestone. Its inputs are pinned as store files:

- per repository, a verify policy (the runtime suite and recipe) and a review policy (the plan's pinned rubric bytes);
- the milestone repositories' shared runtime recipe;
- integration-owned repair for every milestone criterion.

All units are read through the same fixed gate readers, and the delegated `acceptance` decision is judged like the others.

The acceptance input is the plan the acceptance-definition stage pinned. A host is composed before that stage runs, so a product production can now say `acceptance: "pinned"`. The plan pinned for the run revision is then resolved when the milestone is produced. With `pinned`, a static acceptance input or the `acceptance` id is refused. This is a fixed rule, not the arbitrary selector callback that ADR-0173 rejected.

Three cases leave the route unsupported:

- a recipe with data volumes, because nothing supplies their seeds;
- a milestone whose repositories have different recipes;
- a repository without a pinned rubric.

The real run found a defect in the acceptance stage. It required every call in its native scope to have finished with exit zero. Through a real observer, each launch also includes the observer's owned cancellation control, which is stopped with SIGTERM by design. Fixture observers never make that call. The stage now requires every call to be stopped with its outcome inside the original window: a finished call must still exit zero, and a cancelled call no longer fails acceptance. A judge cancelled that way still leaves its decision without a result, so acceptance stays not-ready.

Verification:

- **Validation.** Three new product-production cases are refused (a pinned plan with a static acceptance input, the reserved id, another value), and the pinned form is accepted. A data-volume recipe composes nothing.
- **`npm run eval:public-implementation`.** It now passes all eleven stages from plan to acceptance with real Docker unit and product QA: fourteen launches, each preceded by its controls. It retires both the unit environment and the product environment.
- **Regressions.** `npm run eval:runner-assembly-readiness -- --retire-success` still passes with fixture observers.

### Publication (increment 6)

Publication and the `to-pr` handoff go through `RunnerPublicationStages` with the fixed `GithubCliCodeHost`. Its executor runs `gh` as the runtime's absolute `codeHost.client`. Git keeps the core's own resolution, as every other Git effect does. A runtime without `codeHost` composes nothing.

The composer now covers the whole route, so a `to-pr` route passes static preflight with interactive tools disabled. Every native launch still needs its own observation.

Verification:

- a unit case runs the executor against a synthetic `gh` and checks its exact arguments, and checks that `git` still resolves;
- the coverage case shows every stage supported and preflight available;
- a runtime without a code host composes nothing.

Publication has not run yet. Git expands `insteadOf` rewrites in `remote get-url`, which the code host reads to name the GitHub repository, so a local bare remote cannot sit behind a GitHub URL. Increment 7 therefore uses an SSH-form GitHub remote whose transport a disposable `GIT_SSH_COMMAND` serves from a local bare repository, with a synthetic `gh`.
