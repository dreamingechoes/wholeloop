import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import type { EnvironmentProvisionRequest } from '../../../src/environment/provision.js'
import { EnvironmentRecipes } from '../../../src/environment/recipe-store.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { captureEnvironmentPreparation } from '../../../src/runner/environment-preparation.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'
import { runnerGitFixture } from '../../support/runner-git.js'

const app = 'process.stdout.write("Original provisioning scope.")\n'
async function setup(
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

describe('original provisioning phase owners', () => {
  it.each([
    'cancelled',
    'expired',
    'fenced',
    'foreign-run',
    'root-scope',
    'foreign-scope',
  ] as const)('refuses %s before backend selection or consumption', async (mode) => {
    await setup(async ({ store, scope, context, request, driver, ready }) => {
      const abort = new AbortController()
      context.signal = abort.signal
      if (mode === 'cancelled') abort.abort()
      if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
      if (mode === 'fenced') context.current = () => false
      if (mode === 'foreign-run') request.run = 'run-foreign'
      const selected =
        mode === 'root-scope'
          ? new RunnerEnvironmentScope(store, context.invocation)
          : mode === 'foreign-scope'
            ? new RunnerEnvironmentScope(store, '0'.repeat(64), scope.phase)
            : scope
      await expect(selected.provision(context, request, driver)).rejects.toThrow()
      expect(existsSync(ready)).toBe(false)
      expect(new EnvironmentResources(store.files).list()).toEqual([])
      expect(scope.origin()).toBeUndefined()
    })
  })
  it('retains failed actual preflight owners before any resource and refuses replay', async () => {
    await setup(async ({ store, scope, context, request, driver }) => {
      const result = await scope.provision(context, request, driver)
      expect(result.status).toBe('unavailable')
      expect(result.environment).toBeUndefined()
      expect(new EnvironmentResources(store.files).list()).toEqual([])
      const original = scope.inspect(),
        journal = contractDigest(store.lifecycle.journal.events())
      expect(original.invocationState).toBe('stopped')
      expect(original.reads.length).toBeGreaterThan(0)
      expect(original.operations).toEqual([])
      expect(
        new RunnerEnvironmentScope(
          new RunnerStore(store.files.root),
          context.invocation,
          scope.phase,
        ).inspect(),
      ).toEqual(original)
      await expect(scope.provision(context, request, driver)).rejects.toThrow('original-unresolved')
      expect(scope.inspect()).toEqual(original)
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
      const path = store.files.path(
          `delivery/runner-environments/${context.invocation}/${scope.phase}.json`,
        ),
        bytes = readFileSync(path)
      try {
        const changed = JSON.parse(bytes.toString('utf8'))
        changed.preparation.input.key = 'substituted-key'
        writeFileSync(path, JSON.stringify(changed))
        expect(() => scope.inspect()).toThrow('original-binding')
      } finally {
        writeFileSync(path, bytes)
      }
      try {
        renameSync(`${path}.consumed`, `${path}.consumed.retained`)
        expect(() => scope.inspect()).toThrow('original-binding')
      } finally {
        renameSync(`${path}.consumed.retained`, `${path}.consumed`)
      }
      expect(scope.inspect()).toEqual(original)
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
    })
  })
  it('refuses an existing resource without attributing its producer to a new phase', async () => {
    await setup(async ({ store, scope, context, request, driver, ready }) => {
      const captured = captureEnvironmentPreparation(store, context, request, driver.provenance),
        resources = new EnvironmentResources(store.files)
      // Planned normalized metadata proves refusal only, never actual startup.
      resources.create({
        ...captured.expected,
        schema: 'wholeloop/environment-runtime@1',
        token: 'fixture-existing-resource',
        effect: `effect-${'e'.repeat(32)}`,
        createdAt: store.now(),
        deadline: context.deadline,
        lifetimeDeadline: context.deadline,
        state: 'planned',
        host: { os: 'linux', architecture: 'arm64' },
        resources: [],
        observations: [],
        acceptance: 'not-established',
        publication: 'not-performed',
      })
      const original = resources.get(captured.expected.id),
        journal = contractDigest(store.lifecycle.journal.events())
      await expect(scope.provision(context, request, driver)).rejects.toThrow('already-exists')
      expect(existsSync(ready)).toBe(false)
      expect(scope.origin()).toBeUndefined()
      expect(resources.get(captured.expected.id)).toEqual(original)
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
    })
  })
  it('cancels the original preflight client from a fresh controller after revocation', async () => {
    await setup(async ({ store, scope, context, request, driver, ready }) => {
      const pending = scope.provision(context, request, driver)
      const until = Date.now() + 3000
      while (!existsSync(ready) && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 10))
      expect(existsSync(ready)).toBe(true)
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Cancel the original preparation without a resource record.',
      })
      const recovered = new RunnerStore(store.files.root),
        stage = recovered.stage(contractDigest(context.request), context.stage.id),
        noSelection = () => {
          throw new Error('Cancellation must not select another domain input')
        }
      if (!stage) throw new Error('Original verification stage missing')
      await new RunnerVerificationStages(recovered, {
        identity: context.request.host,
        engine: noSelection,
        suite: noSelection,
        gate: noSelection,
      }).stop(context.request, stage, new AbortController().signal)
      await expect(pending).rejects.toThrow('parent-not-current')
      expect(scope.inspect().invocationState).toBe('stopped')
      expect(new EnvironmentResources(store.files).list()).toEqual([])
    }, true)
  })
  it.each(['signal', 'predicate'] as const)(
    'preserves the captured %s when caller properties are replaced',
    async (mode) => {
      await setup(async ({ scope, context, request, driver, ready }) => {
        const abort = new AbortController()
        let live = true
        context.signal = abort.signal
        context.current = () => live
        const pending = scope.provision(context, request, driver)
        const until = Date.now() + 3000
        while (!existsSync(ready) && Date.now() < until)
          await new Promise((resolve) => setTimeout(resolve, 10))
        try {
          expect(existsSync(ready)).toBe(true)
          if (mode === 'signal') {
            context.signal = new AbortController().signal
            abort.abort()
          } else {
            context.current = () => true
            live = false
          }
          await expect(pending).rejects.toThrow('parent-not-current')
          expect(scope.inspect().invocationState).toBe('stopped')
        } finally {
          abort.abort()
          await pending.catch(() => {})
        }
      }, true)
    },
  )
})
