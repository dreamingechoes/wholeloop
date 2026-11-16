# Plan an environment without executing setup

> **TL;DR** — Discover setup candidates, explicitly select their exact bytes into an isolated environment recipe and detect later changes. Preparation starts no container, script, model or network request.

> [!IMPORTANT]
> **Experimental.** Discovery, recipe validation and immutable selection are tested. [Docker provisioning](./delivery-docker.md) and [retirement](./delivery-lifecycle.md) have their own guides. Autonomous delivery may change in a minor release.

## Prerequisites and stopping point

Install the CLI as in [getting started](../getting-started.md#install-the-cli); Node 20 or later and Bash suffice; Docker and service accounts are unnecessary. All demo files and runtime state stay in the printed temporary directory for inspection.

The example image digest is deliberately illustrative and is never resolved or pulled here. Before actual execution, select a real immutable image available to the chosen backend and prepare a new recipe. The architecture is a requested Linux arm64 environment, not an observation of your host.

## Discover and select explicitly

```bash
set -euo pipefail
wl --version
ENVIRONMENT_DEMO="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-environment.XXXXXX")"
export ENVIRONMENT_DEMO
node --input-type=module <<'JS'
import {mkdirSync, realpathSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const demo = realpathSync(process.env.ENVIRONMENT_DEMO)
const root = join(demo, 'app')
mkdirSync(root)
const app = "require('node:http').createServer((_req,res)=>res.end('ready')).listen(3000,'0.0.0.0')\n"
const pack = JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}})
writeFileSync(join(root, 'app.cjs'), app)
writeFileSync(join(root, 'package.json'), pack)
const hash = text => createHash('sha256').update(text).digest('hex')
const recipe = {
  schema: 'wholeloop/environment-recipe@1',
  backend: {id: 'docker', os: 'linux', architecture: 'arm64', emulation: 'forbid'},
  repositories: [{id: 'app', root}],
  files: [
    {id: 'package', repository: 'app', ref: 'package.json', sha256: hash(pack), kind: 'package'},
    {id: 'server', repository: 'app', ref: 'app.cjs', sha256: hash(app), kind: 'script'},
  ],
  data: ['fixture'],
  services: [{
    id: 'web', image: `example.invalid/wholeloop-demo@sha256:${'a'.repeat(64)}`,
    acquisition: 'cache-only', after: [],
    mounts: [
      {kind: 'workspace', source: 'app', target: '/workspace/app', access: 'read'},
      {kind: 'data', source: 'fixture', target: '/data/fixture', access: 'write'},
    ],
    start: {argv: ['node', '/workspace/app/app.cjs'], cwd: '/workspace/app', origin: {kind: 'file', file: 'server'}},
    readiness: {kind: 'tcp', port: 3000, timeoutMs: 1000},
    ports: [{container: 3000, publish: 'loopback'}], memoryMiB: 128, cpus: 1, secrets: [],
  }],
  commands: [{id: 'test', service: 'web', phase: 'test', timeoutMs: 1000,
    command: {argv: ['npm', 'run', 'test'], cwd: '/workspace/app', origin: {kind: 'package-script', file: 'package', script: 'test'}}}],
  network: {setup: 'none', runtime: 'none', destinations: []},
  limits: {setupMs: 300000, readinessMs: 120000, services: 8, memoryMiB: 8192, cpus: 4, outputBytes: 1048576},
  retention: {failure: 'keep', success: 'keep', reviewAfterMs: 86400000, expiryAction: 'retain'},
}
writeFileSync(join(root, 'recipe.json'), JSON.stringify(recipe))
JS
wl delivery environment-schema --json > "$ENVIRONMENT_DEMO/schema.json"
wl delivery environment-discover --root "$ENVIRONMENT_DEMO/app" --json > "$ENVIRONMENT_DEMO/discovery.json"
wl delivery environment-plan --root "$ENVIRONMENT_DEMO/app" --file recipe.json --store "$ENVIRONMENT_DEMO/store" --json > "$ENVIRONMENT_DEMO/prepared.json"
wl delivery environment-plan --root "$ENVIRONMENT_DEMO/app" --file recipe.json --store "$ENVIRONMENT_DEMO/store" --json > "$ENVIRONMENT_DEMO/repeated.json"
RECIPE_DIGEST="$(node --input-type=module -e 'import{readFileSync}from"node:fs";console.log(JSON.parse(readFileSync(process.argv[1],"utf8")).digest)' "$ENVIRONMENT_DEMO/prepared.json")"
wl delivery environment-inspect --digest "$RECIPE_DIGEST" --store "$ENVIRONMENT_DEMO/store" --json > "$ENVIRONMENT_DEMO/current.json"
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import {readFileSync, appendFileSync} from 'node:fs'
import {join} from 'node:path'
const read = name => JSON.parse(readFileSync(join(process.env.ENVIRONMENT_DEMO, name), 'utf8'))
assert.equal(read('schema.json').executed, false)
assert.equal(read('discovery.json').executed, false)
assert.deepEqual(read('prepared.json'), read('repeated.json'))
assert.equal(read('prepared.json').authority, 'not-granted')
assert.equal(read('current.json').inputs, 'current')
assert.equal(read('current.json').readiness, 'not-observed')
appendFileSync(join(process.env.ENVIRONMENT_DEMO, 'app/app.cjs'), '// Changed after selection.\n')
JS
wl delivery environment-inspect --digest "$RECIPE_DIGEST" --store "$ENVIRONMENT_DEMO/store" --json > "$ENVIRONMENT_DEMO/changed.json"
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
const value = JSON.parse(readFileSync(join(process.env.ENVIRONMENT_DEMO, 'changed.json'), 'utf8'))
assert.equal(value.inputs, 'changed-or-unavailable')
assert.equal(value.readiness, 'not-observed')
assert.equal(value.executed, false)
console.log('PASS: immutable recipe, unchanged repeat, no execution and stale source detected')
console.log(`Retained demo: ${process.env.ENVIRONMENT_DEMO}`)
JS
```

## What was established

Selected files currently use bounded UTF-8 text (one MiB each, eight MiB in total); binary fixture delivery requires a separate supported input route. The recipe binds selected file SHA-256 values, immutable image identity, explicit argv origins, service ordering, logical mounts, ports, readiness procedure, network phases and finite resources. The external store retains selected bytes; changing live files creates a different recipe or a stale inspection result. Repeating the same input preserves identity.

Discovery lists names and hashes; it never selects an executable route. A repository source root is a read origin, not a host mount. Actual workers require backend-allocated candidate workspaces. No home, controller store, credential directory, Docker socket or arbitrary host mount can be expressed by this contract.

Image acquisition, scoped egress and secret-reference providers are requested capabilities. A backend must establish actual support and authority or refuse; preparation cannot activate them. Secret values never belong in recipes, command arguments or generated files. Failed resources remain retained, and the review deadline authorizes no automatic deletion.

Existing env declare/report commands retain their original declaration-only meaning. See [ADR-0102](../decisions/0102-inert-environment-recipes-and-pinned-setup-origins.md), the [environment specification](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) and [V1 acceptance](../v1-acceptance.md). Stop here: no application readiness or behavioral acceptance has been observed.

<!-- docnav -->
[◀ Delivery recovery](delivery-recovery.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Docker application environments ▶](delivery-docker.md)
