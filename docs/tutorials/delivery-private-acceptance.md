# Keep acceptance inputs private and prove regression sensitivity

> **TL;DR** — Pin private HTTP cases before the builder runs. Wholeloop mounts them only into the owned evaluator, executes the same definition on the actual base and candidate, and withholds regression acceptance until the relevant red/green result is observed.

> [!NOTE]
> **Status: ✅ implemented, experimental.** The private host, immutable definitions and observed red and green comparison are tested and were observed in Docker. Autonomous delivery may change in a minor release.

Commands that start with `npm run eval` are model-free controls that run from a source checkout ([development guide](../contributing/development.md#build-from-source)); every `wl` command uses the installed CLI.

## Inspect the contract

With the `wl` CLI ([getting started](../getting-started.md#install-the-cli)), these commands inspect metadata without running Docker, a model or a mutator:

```bash
set -euo pipefail
npm run build
wl delivery private-schema --json
```

The output contains six closed contracts and the embedded evaluator program digest. The evaluator is built into the CLI; users do not install esbuild or a universal mutation framework. Follow [delivery planning](./delivery-plan.md), [authorization](./delivery-authorization.md), [Docker setup](./delivery-docker.md) and [acceptance definitions](./delivery-acceptance.md) first.

## Pin the private definition before implementation

Create the definition in an operator-controlled directory outside the builder workspace. Replace run, plan and source with the actual prepared delivery identities. For example, a regression case can require an actual empty-title POST to return 400:

```json
{
  "schema": "wholeloop/private-acceptance@1",
  "run": "delivery-0123456789abcdef",
  "revision": 1,
  "plan": "REPLACE_WITH_DELIVERY_PLAN_DIGEST",
  "source": "REPLACE_WITH_SOURCE_DIGEST",
  "case": "empty-title",
  "behavior": {
    "schema": "wholeloop/behavior-input@1",
    "kind": "api",
    "service": "web",
    "port": 3000,
    "steps": [{ "id": "empty", "kind": "request", "method": "POST", "path": "/tasks", "headers": { "content-type": "application/json" }, "body": "{\"title\":\"\"}" }]
  },
  "assertions": [{ "id": "reject-empty", "description": "Reject an empty task title.", "subject": "status", "operator": "equals", "expected": "400" }],
  "sensitivity": { "mode": "regression", "relevant": ["reject-empty"] }
}
```

This is definition data, not an executable demo: use your actual application contract and identities before running it. Inputs may contain ordinary test data; recognizable credentials are refused. The private reference host supports bounded HTTP request steps and existing status/header/JSON assertions, including explicit per-assertion targets. Private CLI/browser/semantic runners and private restart steps are unavailable in this reference host; ordinary [CLI/API](./delivery-behaviors.md) and [browser](./delivery-browsers.md) acceptance remain available through their own hosts.

From your shell, set task-specific paths to the actual operator directory and external store:

```bash
set -euo pipefail
wl delivery private-plan --file "$private_case_file" --root "$operator_input_dir" --store "$delivery_store" --json
wl delivery private-inspect --digest "$private_definition_digest" --store "$delivery_store" --json
```

The preparation/inspection receipts expose identity and counts, never request bodies or expected values. Record the returned digest. Repeating the same preparation is idempotent; changing a pinned definition or preparing after builder admission is refused. A new accepted delivery revision is required to change it.

## Connect the public acceptance case

Before builder admission, add a machine-owned applicable case with the same case ID. Set runner.kind to api, runner.capability to evaluator.private-http, and runner.input to a JSON string containing the following object:

```json
{ "schema": "wholeloop/private-case-input@1", "manifest": "REPLACE_WITH_PRIVATE_DEFINITION_DIGEST" }
```

Set fixture.sha256 to that same digest. Give the public case exactly one state/equals assertion: id private-outcome, path /passed, expected true as a JSON literal, and a clear description. Its initial state/actions/failure conditions must still describe the agreed scenario. Hidden requests and expected values stay outside this public definition.

Provision an allocated clean base worktree and execute the case with acceptance-run and a stable key before modifying the candidate. The router chooses the fixed private host automatically. The helper image must match the reference returned by environment-schema; keep runtime networking internal. Each invocation creates a separate owned private input volume and read-only evaluator mount. Canonical byte encoding preserves Unicode across native pipe chunks; actual copied hashes must match before any verifier action. One-MiB case and 256-KiB program bounds fit the unchanged two-MiB transport cap. It receives no application code, original controller directory or credentials. The application receives actual HTTP requests through its owned service IP/port, including canonical port 80 handling.

After implementing the change, provision the current candidate and execute the same pinned case with another stable key. Preserve the baseline receipt and external artifacts. The private controller store is trusted; the actual native worker host must deny access to it. A same-user shared filesystem cannot establish privacy. Actual application-container denials do not certify every coding client's sandbox. See [ADR-0108](../decisions/0108-evaluator-only-inputs-and-observed-regression-sensitivity.md).

## Inspect red/green sensitivity

Write a bounded request containing the actual acceptance plan digest and observed environment/key pairs:

```json
{
  "schema": "wholeloop/acceptance-sensitivity-request@1",
  "plan": "REPLACE_WITH_ACCEPTANCE_PLAN_DIGEST",
  "case": "empty-title",
  "baseline": { "environment": "environment-REPLACE_WITH_BASE_ID", "key": "baseline" },
  "candidate": { "environment": "environment-REPLACE_WITH_CANDIDATE_ID", "key": "candidate" }
}
```

```bash
set -euo pipefail
wl delivery private-sensitivity --file "$sensitivity_request_file" --root "$operator_input_dir" --store "$delivery_store" --json
```

This reads verified controller observations and dispatches nothing. Proven means only that the pinned relevant objective case failed on the observed clean Git base and passed on the latest current candidate with the same evaluator and comparable execution configuration. It does not mean that all semantic properties of the product are proven. Only implementation-script bytes and allocated controller paths may differ: fixture/guidance/package/tool bytes, images, commands, networks and limits stay fixed. Dirty/untracked baseline code, changed configuration, setup failures and stale candidates cannot supply red/green proof. Assertions outside the pinned relevant set are baseline controls: they must pass, so an unrelated existing failure cannot be used as the relevant mismatch. Add controls appropriate to the actual application rather than guessing health endpoints.

Choose new-feature or not-applicable in the original private definition when regression sensitivity does not apply. A new feature's absence in the baseline is not a manufactured failing regression. Missing evidence stays unproven/unavailable. Aggregate acceptance enforces applicable regression sensitivity automatically: a passing candidate case without its relevant base failure leaves acceptance not-established. Sealing can retain that incomplete report; it does not turn it into success. Repaired candidates must produce current evidence again.

## Optional native mutation data

The original private definition can select an existing phase-test recipe command:

```json
{ "mutation": { "service": "web", "command": "mutation" } }
```

Place this under sensitivity before pinning. No guessed executable, downloaded mutator or new mutation dependency is introduced. The declared command runs under the same finite test effect before private HTTP assertions. A missing command remains unavailable; uncertain dispatched work still stops/fences recovery. To require successful mutation-command execution as an acceptance condition, also define an ordinary required CLI case.

For structured counters, the command must emit one JSON object matching wholeloop/mutation-counters@1, as shown by private-schema: reported engine/version, complete true and consistent nonnegative total/killed/survived/timedOut/uncovered/errors counts. Other output has observed process/exit metadata and digests but no interpreted counters. These are repository-reported values; zero mutants, an exit zero, a constant-assertion scan or a model statement never establish semantic sensitivity. The report retains semanticSensitivity unknown even when objective regression sensitivity is proven.

## Run the model-free boundary evaluation

Cache the reference helper image through your normal reviewed Docker workflow, then run:

```bash
set -euo pipefail
npm run eval:private -- --retire-success
```

The evaluator retains its report outside the repository and tests actual denied reads/writes, empty-title red/green, unavailable mutation capability, new-feature classification, native synthetic counter reporting, aggregate acceptance enforcement and stale candidates. Synthetic native counters test the reporting path; they do not certify a real mutation engine. Successful explicit retirement observes absence of exact owned resources. Failed runs retain their resources and evidence for [owned lifecycle inspection/retirement](./delivery-lifecycle.md). Keep native/model, independent Linux-host, real mutator and account acceptance separately scoped in [manual verification](../../roadmap/manual-verification.md).

<!-- docnav -->
[◀ Execute isolated browser acceptance](delivery-browsers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Integrated milestone candidates ▶](delivery-integration-candidates.md)
