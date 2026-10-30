import { writeFileSync } from 'node:fs'
import { contractDigest } from '../../src/contracts/compatibility.js'
import { DockerCli } from '../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../src/environment/docker-policy.js'
import type { EnvironmentProvisionRequest } from '../../src/environment/provision.js'
import { EnvironmentRecipes } from '../../src/environment/recipe-store.js'
import { workspaceSnapshot } from '../../src/gates/snapshot.js'
import { RunnerEnvironmentScope } from '../../src/runner/environment-scope.js'
import type { RunnerStore } from '../../src/runner/store.js'
import { git } from './delivery.js'
import { environmentRecipe } from './environment.js'
import { runnerGitFixture } from './runner-git.js'

const app = 'process.stdout.write("Original provisioning scope.")\n'
export async function runnerPreparationFixture(
  operation: (input: {
    store: RunnerStore
    scope: RunnerEnvironmentScope
    context: Parameters<RunnerEnvironmentScope['provision']>[0]
    request: EnvironmentProvisionRequest
    driver: DockerCli
    ready: string
  }) => Promise<void>,
  hanging = false,
) {
  await runnerGitFixture(
    async ({ store, root, dispatch }) => {
      const context = dispatch('verification:search'),
        candidate = store.files.path('fixture-provision-candidate'),
        ready = store.files.path('fixture-provision-started'),
        binary = store.files.path('fixture-docker'),
        scope = new RunnerEnvironmentScope(
          store,
          context.invocation,
          contractDigest({ phase: 'original-preparation' }),
        )
      git(root, ['worktree', 'add', '-b', 'wl/provision-scope', candidate, 'HEAD'])
      const snapshot = workspaceSnapshot(candidate),
        recipe = new EnvironmentRecipes(store.files.root).prepare(environmentRecipe(root, app))
      writeFileSync(
        binary,
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(ready)},'started');${hanging ? 'setInterval(()=>{},100)' : 'process.stdout.write(JSON.stringify("unix:///fixture/docker.sock"))'}\n`,
        { mode: 0o700 },
      )
      await operation({
        store,
        scope,
        context,
        request: {
          schema: 'wholeloop/environment-provision-request@1',
          run: context.request.run,
          recipe: recipe.digest,
          key: 'original-owned-preparation',
          helperImage: DOCKER_REFERENCE_HELPER,
          workspaces: [
            { repository: 'app', path: candidate, head: snapshot.head, snapshot: snapshot.digest },
          ],
        },
        driver: new DockerCli(binary),
        ready,
      })
    },
    { singleUnit: true, seed: { 'app.cjs': app } },
  )
}
