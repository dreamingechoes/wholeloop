import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentRecipes } from '../../../src/environment/recipe-store.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import {
  RunnerProductEnvironments,
  type RunnerProductInput,
  type RunnerProductProduction,
} from '../../../src/runner/product-environments.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { environmentRecipe } from '../../support/environment.js'
import { runnerGitFixture } from '../../support/runner-git.js'

const input = (): RunnerProductInput => ({
  candidate: 'a'.repeat(64),
  assembly: 'b'.repeat(64),
  helperImage: DOCKER_REFERENCE_HELPER,
})
const deny: DockerTransport = {
  provenance: 'host-observed',
  call: async () => {
    throw new Error('Unverified product inputs must not invoke Docker')
  },
}
const reader = (store: RunnerStore) =>
  new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map()))
const app = "require('node:http').createServer((_, res) => res.end('ok')).listen(3000)\n"
const production = (recipe: string): RunnerProductProduction => ({
  helperImage: DOCKER_REFERENCE_HELPER,
  recipe,
  inputs: [
    {
      id: 'acceptance',
      kind: 'acceptance',
      ref: 'e'.repeat(64),
      sha256: 'e'.repeat(64),
      after: ['recipe'],
    },
  ],
  repairOwners: [{ criterion: 'search', kind: 'integration', id: 'feature' }],
})
const untouched = (store: RunnerStore, invocation: string, run: string) => {
  const base = `delivery/runner-products/${invocation}`
  for (const path of [
    `${base}/production.json`,
    `${base}/production-assembly`,
    `${base}/binding.json`,
    `delivery/assembly-bases/${run}`,
  ])
    expect(existsSync(store.files.path(path))).toBe(false)
  expect(new EnvironmentResources(store.files).list()).toEqual([])
}

describe('fixed original product environment selection', () => {
  it.each(['candidate', 'assembly', 'helperImage', 'extra-field', 'milestone'] as const)(
    'rejects malformed %s configuration before selection',
    (mode) =>
      runnerGitFixture(
        async ({ store }) => {
          const selected = input()
          if (mode === 'candidate') selected.candidate = '../foreign'
          if (mode === 'assembly') selected.assembly = 'invalid'
          if (mode === 'helperImage') selected.helperImage = 'node:latest'
          if (mode === 'extra-field') Object.assign(selected, { environment: 'caller-selected' })
          const before = contractDigest(store.lifecycle.journal.events())
          expect(
            () =>
              new RunnerProductEnvironments(
                store,
                reader(store),
                new Map([[mode === 'milestone' ? '../foreign' : 'feature', selected]]),
                deny,
              ),
          ).toThrow('Delivery runner refused:')
          expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        },
        { singleUnit: true },
      ),
  )
  it.each([
    'cancelled',
    'expired',
    'fenced',
    'invalid-deadline',
    'changed-plan',
    'changed-stage',
    'foreign-invocation',
    'wrong-kind',
    'missing-selection',
    'unverified-vector',
    'lost-binding',
  ] as const)('refuses %s without provisioning or recording selection', (mode) =>
    runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const context = dispatch(
            mode === 'wrong-kind' ? 'verification:search' : 'integration:feature',
          ),
          products = new RunnerProductEnvironments(
            store,
            reader(store),
            mode === 'missing-selection' ? new Map() : new Map([['feature', input()]]),
            deny,
          ),
          base = `delivery/runner-products/${context.invocation}`,
          before = contractDigest(store.lifecycle.journal.events())
        if (mode === 'cancelled') context.signal = AbortSignal.abort()
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') context.current = () => false
        if (mode === 'invalid-deadline') context.deadline = 'tomorrow'
        if (mode === 'changed-plan') context.plan = { ...context.plan, owner: 'Changed Owner' }
        if (mode === 'changed-stage') context.stage = { ...context.stage, criteria: [] }
        if (mode === 'foreign-invocation') context.invocation = '0'.repeat(64)
        if (mode === 'lost-binding') store.files.atomic(`${base}/consumed`, `${'c'.repeat(64)}\n`)
        await expect(products.prepare(context)).rejects.toThrow('Delivery runner refused:')
        expect(existsSync(store.files.path(`${base}/binding.json`))).toBe(false)
        expect(new EnvironmentResources(store.files).list()).toEqual([])
        const record = store.stage(contractDigest(request), context.stage.id)
        if (!record) throw new Error('Original issued stage required')
        expect(products.inspect(request, record)).toBeUndefined()
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      },
      { singleUnit: true },
    ),
  )
  it.each(['signal', 'predicate'] as const)(
    'retains the original %s and copied configuration across asynchronous readiness',
    (mode) =>
      runnerGitFixture(
        async ({ store, dispatch }) => {
          const context = dispatch('integration:feature'),
            readiness = reader(store),
            selected = input(),
            inputs = new Map([['feature', selected]]),
            products = new RunnerProductEnvironments(store, readiness, inputs, deny),
            abort = new AbortController(),
            original = readiness.inspect
          let live = true,
            entered = () => {},
            release = () => {}
          const admission = new Promise<void>((resolve) => {
              entered = resolve
            }),
            continuation = new Promise<void>((resolve) => {
              release = resolve
            })
          context.signal = abort.signal
          context.current = () => live
          readiness.inspect = async (...args) => {
            expect(args[2]).toBe('b'.repeat(64))
            entered()
            await continuation
            return original.apply(readiness, args)
          }
          selected.assembly = 'd'.repeat(64)
          inputs.clear()
          const before = contractDigest(store.lifecycle.journal.events()),
            pending = products.prepare(context)
          await admission
          if (mode === 'signal') {
            abort.abort()
            context.signal = new AbortController().signal
          } else {
            live = false
            context.current = () => true
          }
          context.deadline = new Date(Date.now() + 60000).toISOString()
          release()
          await expect(pending).rejects.toThrow('product-environment-not-current')
          expect(new EnvironmentResources(store.files).list()).toEqual([])
          expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        },
        { singleUnit: true },
      ),
  )
  it('dispatches configured preparation without a caller-provided environment and refuses override', () =>
    runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const readiness = reader(store),
          products = new RunnerProductEnvironments(
            store,
            readiness,
            new Map([['feature', input()]]),
            deny,
          ),
          dispatcher = new RunnerStageDispatcher(
            store,
            request.host,
            { integration: new RunnerIntegrationStages(store, readiness) },
            products,
          ),
          context = dispatch('integration:feature'),
          before = contractDigest(store.lifecycle.journal.events())
        await expect(dispatcher.execute(context)).rejects.toThrow(
          'product-environment-current-assembly-required',
        )
        await expect(
          dispatcher.execute(context, {
            selection: {
              schema: 'wholeloop/integration-verification-request@1',
              candidate: 'a'.repeat(64),
              assembly: 'b'.repeat(64),
              environment: `environment-${'c'.repeat(32)}`,
            },
          }),
        ).rejects.toThrow('dispatcher-product-selection-conflict')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      },
      { singleUnit: true },
    ))
  it.each([
    'foreign-reader',
    'different-reader',
    'missing-integration',
    'structural-product',
  ] as const)('refuses %s configuration', (mode) =>
    runnerGitFixture(
      async ({ store, request }) => {
        const readiness = reader(store),
          foreign = new RunnerStore(store.files.path('foreign-product-store'))
        if (mode === 'foreign-reader') {
          expect(
            () => new RunnerProductEnvironments(store, reader(foreign), new Map(), deny),
          ).toThrow('product-environment-fixed-readiness-required')
          return
        }
        const products = new RunnerProductEnvironments(store, readiness, new Map(), deny)
        expect(
          () =>
            new RunnerStageDispatcher(
              store,
              request.host,
              mode === 'missing-integration'
                ? {}
                : {
                    integration: new RunnerIntegrationStages(
                      store,
                      mode === 'different-reader' ? reader(store) : readiness,
                    ),
                  },
              mode === 'structural-product'
                ? ({ store, readiness } as RunnerProductEnvironments)
                : products,
            ),
        ).toThrow('dispatcher-fixed-product-environments-required')
      },
      { singleUnit: true },
    ),
  )
})

describe('original milestone assembly and candidate production', () => {
  it.each([
    'recipe',
    'recipe-input-id',
    'recipe-input-kind',
    'two-acceptance',
    'no-acceptance',
    'extra-field',
    'helperImage',
    'pinned-with-acceptance',
    'pinned-acceptance-id',
    'pinned-other-value',
  ] as const)('rejects malformed %s production before selection', (mode) =>
    runnerGitFixture(
      async ({ store }) => {
        const selected = production('f'.repeat(64)),
          [acceptance] = selected.inputs
        if (!acceptance) throw new Error('Original acceptance input required')
        if (mode === 'recipe') selected.recipe = '../template'
        if (mode === 'recipe-input-id')
          selected.inputs.push({ ...acceptance, id: 'recipe', kind: 'data' })
        if (mode === 'recipe-input-kind')
          selected.inputs.push({ ...acceptance, id: 'other', kind: 'recipe' })
        if (mode === 'two-acceptance') selected.inputs.push({ ...acceptance, id: 'second' })
        if (mode === 'no-acceptance') acceptance.kind = 'data'
        if (mode === 'extra-field') Object.assign(selected, { assembly: 'b'.repeat(64) })
        if (mode === 'helperImage') selected.helperImage = 'node:latest'
        // ADR-0207: a pinned acceptance is resolved later, so none may be given
        // and its identifier stays reserved.
        if (mode === 'pinned-with-acceptance') selected.acceptance = 'pinned'
        if (mode === 'pinned-acceptance-id') {
          selected.acceptance = 'pinned'
          acceptance.kind = 'data'
        }
        if (mode === 'pinned-other-value')
          Object.assign(selected, {
            acceptance: 'latest',
            inputs: [{ ...acceptance, kind: 'data', id: 'db' }],
          })
        const before = contractDigest(store.lifecycle.journal.events())
        expect(
          () =>
            new RunnerProductEnvironments(
              store,
              reader(store),
              new Map([['feature', selected]]),
              deny,
            ),
        ).toThrow('Delivery runner refused:')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      },
      { singleUnit: true },
    ),
  )
  it('accepts a pinned acceptance with no static acceptance input', () =>
    runnerGitFixture(
      async ({ store }) => {
        const selected = production('f'.repeat(64)),
          [acceptance] = selected.inputs
        if (!acceptance) throw new Error('Original acceptance input required')
        selected.acceptance = 'pinned'
        selected.inputs = [{ ...acceptance, id: 'db', kind: 'data' }]
        expect(
          new RunnerProductEnvironments(
            store,
            reader(store),
            new Map([['feature', selected]]),
            deny,
          ).configured('feature'),
        ).toBe(true)
      },
      { singleUnit: true },
    ))
  it.each([
    'cancelled',
    'fenced',
    'expired',
    'unverified-vector',
    'missing-template',
    'foreign-repository',
    'lost-production',
  ] as const)('refuses %s before any production binding or Git effect', (mode) =>
    runnerGitFixture(
      async ({ store, request, root, dispatch }) => {
        // Rename the only repository consistently; the template remains a valid recipe.
        const template =
          mode === 'foreign-repository'
            ? JSON.parse(
                JSON.stringify(environmentRecipe(root, app))
                  .replaceAll('"app"', '"other"')
                  .replaceAll('/workspace/app', '/workspace/other'),
              )
            : environmentRecipe(root, app)
        const prepared = new EnvironmentRecipes(store.files.root).prepare(template),
          context = dispatch('integration:feature'),
          products = new RunnerProductEnvironments(
            store,
            reader(store),
            new Map([
              [
                'feature',
                production(mode === 'missing-template' ? 'd'.repeat(64) : prepared.digest),
              ],
            ]),
            deny,
          ),
          base = `delivery/runner-products/${context.invocation}`,
          before = contractDigest(store.lifecycle.journal.events())
        if (mode === 'cancelled') context.signal = AbortSignal.abort()
        if (mode === 'fenced') context.current = () => false
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'lost-production')
          store.files.atomic(`${base}/production.consumed`, `${'c'.repeat(64)}\n`)
        await expect(products.prepare(context)).rejects.toThrow(
          mode === 'unverified-vector'
            ? 'product-environment-current-units-required'
            : mode === 'foreign-repository'
              ? 'product-environment-recipe-repositories'
              : mode === 'missing-template'
                ? 'Environment recipe refused:'
                : 'Delivery runner refused:',
        )
        untouched(store, context.invocation, request.run)
        const record = store.stage(contractDigest(request), context.stage.id)
        if (!record) throw new Error('Original issued stage required')
        expect(products.inspect(request, record)).toBeUndefined()
        products.stop(request, record)
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      },
      { singleUnit: true, seed: { 'app.cjs': app } },
    ),
  )
  it.each(['signal', 'predicate'] as const)(
    'retains the original %s across asynchronous unit readiness before production',
    (mode) =>
      runnerGitFixture(
        async ({ store, request, root, dispatch }) => {
          const context = dispatch('integration:feature'),
            readiness = reader(store),
            prepared = new EnvironmentRecipes(store.files.root).prepare(
              environmentRecipe(root, app),
            ),
            selected = production(prepared.digest),
            inputs = new Map([['feature', selected]]),
            products = new RunnerProductEnvironments(store, readiness, inputs, deny),
            abort = new AbortController(),
            original = readiness.units.inspect
          let live = true,
            entered = () => {},
            release = () => {}
          const admission = new Promise<void>((resolve) => {
              entered = resolve
            }),
            continuation = new Promise<void>((resolve) => {
              release = resolve
            })
          context.signal = abort.signal
          context.current = () => live
          readiness.units.inspect = async (...args) => {
            entered()
            await continuation
            return original.apply(readiness.units, args)
          }
          selected.recipe = 'd'.repeat(64)
          inputs.clear()
          const before = contractDigest(store.lifecycle.journal.events()),
            pending = products.prepare(context)
          await admission
          if (mode === 'signal') {
            abort.abort()
            context.signal = new AbortController().signal
          } else {
            live = false
            context.current = () => true
          }
          context.deadline = new Date(Date.now() + 60000).toISOString()
          release()
          await expect(pending).rejects.toThrow('product-environment-not-current')
          untouched(store, context.invocation, request.run)
          expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        },
        { singleUnit: true, seed: { 'app.cjs': app } },
      ),
  )
})
