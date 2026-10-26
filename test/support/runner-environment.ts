import { writeFileSync } from 'node:fs'
import { DockerCli, type DockerTransport } from '../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../src/environment/docker-policy.js'
import { EnvironmentOperations } from '../../src/environment/operations.js'
import { EnvironmentResources } from '../../src/environment/runtime.js'
import { RunnerEnvironmentScope } from '../../src/runner/environment-scope.js'
import type { RunnerStore } from '../../src/runner/store.js'
import { runnerGitFixture } from './runner-git.js'

export async function runnerEnvironmentFixture(
  run: (input: {
    store: RunnerStore
    context: Parameters<RunnerEnvironmentScope['run']>[0]
    scope: RunnerEnvironmentScope
    environment: string
    operations: EnvironmentOperations
    driver: DockerTransport
    ready: string
  }) => Promise<void>,
  hanging = false,
) {
  await runnerGitFixture(
    async ({ store, request, dispatch }) => {
      const context = dispatch('verification:search'),
        environment = `environment-${'a'.repeat(32)}`,
        authority = store.lifecycle.authority.inspect(request.grant),
        ready = store.files.path('fixture-docker-started'),
        binary = store.files.path('fixture-docker')
      // Normalized environment metadata exercises ownership only. No Docker daemon,
      // application readiness, containment or behavioral acceptance is certified here.
      new EnvironmentResources(store.files).create({
        schema: 'wholeloop/environment-runtime@1',
        id: environment,
        run: request.run,
        basis: request.plan,
        recipe: 'b'.repeat(64),
        key: 'ownership-fixture',
        grant: request.grant,
        grantDigest: authority.digest,
        token: 'owned-fixture-nonce',
        effect: `effect-${'c'.repeat(32)}`,
        createdAt: store.now(),
        deadline: context.deadline,
        lifetimeDeadline: context.deadline,
        state: 'ready',
        provenance: 'host-observed',
        helperImage: DOCKER_REFERENCE_HELPER,
        host: { os: 'linux', architecture: 'arm64' },
        candidates: [],
        resources: [],
        observations: [],
        acceptance: 'not-established',
        publication: 'not-performed',
      })
      writeFileSync(
        binary,
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(ready)},'started');${hanging ? 'setInterval(()=>{},100)' : "process.stdout.write('Observed synthetic client output.')"}\n`,
        { mode: 0o700 },
      )
      await run({
        store,
        context,
        scope: new RunnerEnvironmentScope(store, context.invocation),
        environment,
        operations: new EnvironmentOperations(store.files, environment, 'host-observed'),
        driver: new DockerCli(binary),
        ready,
      })
    },
    { singleUnit: true },
  )
}
