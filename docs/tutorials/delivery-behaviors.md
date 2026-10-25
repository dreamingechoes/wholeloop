# Execute API and CLI acceptance against an owned application

> **TL;DR** — Pin objective cases, start the declared Docker application and execute each case with a stable key. Wholeloop compares complete real responses or command output; unit suites and manual acceptance remain separate evidence.

> [!NOTE]
> **Status: ✅ implemented.** The fixed host, exact effect/candidate binding, complete output checks, restart/persistence and once-per-round suite reuse pass local automated verification and actual Docker observations. [Browser execution](./delivery-browsers.md) is also available; [private HTTP regression evaluation](./delivery-private-acceptance.md) is available. Semantic/native certification remains separate. No native model or vendor account is required for this evaluator.

## Inspect the contract without executing anything

Build the checkout with Node 22 or later and npm. The published bundle retains its Node 20 minimum. This command is inert and needs no Docker daemon, account or execution grant.

```bash
set -euo pipefail
npm run build
node dist/wl.mjs delivery behavior-schema --json
```

## Define a case before the builder runs

Follow [acceptance planning](./delivery-acceptance.md) and [Docker environment setup](./delivery-docker.md). The acceptance case's runner.input is a JSON string containing the behavior-input object. These fragments are definition data; replace the service, command, paths and expectations with the actual reviewed application's contract before pinning the plan.

An API input can create a task, restart the same service and inspect persisted state:

```json
{
  "schema": "wholeloop/behavior-input@1",
  "kind": "api",
  "service": "web",
  "port": 3000,
  "steps": [
    {
      "id": "create",
      "kind": "request",
      "method": "POST",
      "path": "/tasks",
      "headers": { "content-type": "application/json" },
      "body": "{\"title\":\"Durable task\"}"
    },
    { "id": "restart", "kind": "restart" },
    { "id": "find", "kind": "request", "method": "GET", "path": "/tasks?title=Durable" }
  ],
  "targets": [{ "assertion": "matching-ids", "step": "find" }]
}
```

Pair this with a json/equals assertion whose path is /ids and whose expected JSON literal is ["task-1"]. Assertions select the last request by default; targets chooses a named request for each assertion. JSON and header paths use JSON Pointer. Supported API subjects are status, header and json. Response headers are limited to content-type, content-length, location, etag and cache-control to exclude cookies and authentication material. Assertions must name one of these exact header paths. An excluded header is unobserved; it cannot satisfy an assertion that it is absent.

A CLI input selects one exact phase-test command from the environment recipe:

```json
{
  "schema": "wholeloop/behavior-input@1",
  "kind": "cli",
  "service": "web",
  "command": "validate",
  "stdin": ""
}
```

Supported CLI subjects are exit, stdout, stderr and json. An exit/equals expectation of 7 can deliberately verify rejected empty input. The recipe still owns the command's argv, working directory and provenance. The runner cannot supply a different executable. The process receipt identifies the actual controller-side Docker invoker; the artifact separately identifies the application container and daemon-observed exit. An unobserved application PID or signal is labelled accordingly. The private client close must match the application exit; the wrapper's normalized exit remains a separate process fact. Both output streams drain before wrapper exit.

## Run and inspect

After pinning the plan and provisioning its current owned environment, use delivery acceptance-run with --digest, --case, --key, --environment and --store. The stable key binds exactly one invocation to those inputs. Repeating it reads the existing result; an unresolved intent refuses a blind rerun. Use a new key only for an explicitly new execution, retaining all earlier evidence. The command returns acceptance-case-result@1 and exits nonzero unless the case passes.

Use delivery acceptance-report to assess current criterion coverage, and acceptance-seal to retain the report privately. A case result grants no publication permission and never records human testing. Changed candidate bytes, a different recipe/environment, a newer failure or unavailable required evidence prevent reusing an earlier success.

## Run the reproducible model-free evaluation

This opt-in check needs a local Docker Linux daemon supporting the [reference backend](./delivery-docker.md), the cached immutable reference Node image and enough free daemon capacity. It creates disposable Git worktrees and backend-owned volumes outside this repository. There is no image pull, native model or vendor account. Successful teardown targets only its exact recorded resources; a failed evaluation retains its resources and external evidence directory for inspection.

```bash
set -euo pipefail
npm run eval:behaviors -- --retire-success
```

The evaluator starts with a memory-only task application and a deliberately green unit suite. Wholeloop must fail persistence after a real restart, preserve a wrong-exit failure and distinguish missing data from zero. It then repairs the candidate to use its owned data volume and requires a new successful restart observation. It also verifies a real exit seven, actual process metadata and once-per-round suite reuse through the existing gate journal. A failed case in this evaluator is an expected test observation; the final evaluation succeeds only if every expected failure and subsequent repair is observed correctly.

For application-specific suites, the trusted dockerSuiteExecutor function maps each declared command reference to a pinned CLI case. It checks exact argv/cwd, current candidate and an explicit zero-exit assertion before using runSuite's existing cache. The default supervised suite executor is unchanged. Neither path resets gate rounds after repairs.

## When execution cannot finish

Missing capabilities, changed identities, overflow, partial HTTP bodies, unsupported encodings, foreign redirects, revocation and deadlines cannot produce a pass. An uncertain HTTP action is not retried; its environment can be fenced and stopped while retaining data. Stopping a server does not prove whether an earlier request committed. Inspect the original effect and case records before choosing another environment or candidate. See [owned lifecycle recovery](./delivery-lifecycle.md) and [ADR-0106](../decisions/0106-observe-declared-api-and-cli-behavior.md).

<!-- docnav -->
[◀ Behavioral acceptance and evidence](delivery-acceptance.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Execute isolated browser acceptance ▶](delivery-browsers.md)
