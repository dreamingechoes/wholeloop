import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import {
  RunnerIntegrationStages,
  rootIntegrationCaseOwner,
} from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerGitFixture } from '../../support/runner-git.js'

it.each([
  ['cli', 'process.exec', 'container-start'],
  ['api', 'http.request', 'controller-http'],
  ['api', 'evaluator.private-http', 'evaluator-container'],
  ['semantic', 'evaluator.private-http', 'unsupported'],
  ['browser', 'browser.use', 'unsupported'],
  ['browser', 'browser.journey', 'browser-exec'],
  ['api', 'browser.journey', 'unsupported'],
  ['api', 'process.exec', 'unsupported'],
  ['cli', 'http.request', 'unsupported'],
  ['human', 'manual.observe', 'unsupported'],
] as const)('requires the declared owner for %s/%s', (kind, capability, owner) => {
  expect(rootIntegrationCaseOwner({ runner: { kind, capability, input: '{}' } })).toBe(owner)
})

it.each(['cancelled', 'expired', 'fenced', 'invalid-deadline', 'unverified-vector'] as const)(
  'refuses %s root integration without native work or a consumed binding',
  (mode) =>
    runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const context = dispatch('integration:feature'),
          host = new RunnerIntegrationStages(
            store,
            new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map())),
          ),
          abort = new AbortController()
        context.signal = abort.signal
        if (mode === 'cancelled') abort.abort()
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') context.current = () => false
        if (mode === 'invalid-deadline') context.deadline = 'tomorrow'
        const before = contractDigest(store.lifecycle.journal.events())
        await expect(
          host.execute(
            context,
            {
              schema: 'wholeloop/integration-verification-request@1',
              candidate: 'a'.repeat(64),
              assembly: 'b'.repeat(64),
              environment: `environment-${'c'.repeat(32)}`,
            },
            {
              provenance: 'host-observed',
              async call() {
                throw new Error('No native command allowed')
              },
            },
          ),
        ).rejects.toThrow(
          mode === 'unverified-vector'
            ? 'integration-stage-assembly-not-ready'
            : 'integration-stage-not-current',
        )
        expect(
          existsSync(
            store.files.path(`delivery/runner-integrations/${context.invocation}/consumed`),
          ),
        ).toBe(false)
        expect(new RunnerEnvironmentScope(store, context.invocation).origin()).toBeUndefined()
        const record = store.stage(contractDigest(request), context.stage.id)
        if (!record) throw new Error('Original fixture stage missing')
        expect(await host.inspect(request, record)).toMatchObject({
          status: 'unknown',
          invocationState: 'unknown',
          provenance: 'fixture',
        })
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      },
      { singleUnit: true },
    ),
)

it('retains the original signal when the caller replaces its context during readiness', () =>
  runnerGitFixture(
    async ({ store, dispatch }) => {
      const context = dispatch('integration:feature'),
        abort = new AbortController(),
        readiness = new RunnerAssemblyReadiness(
          store,
          new RunnerMilestoneReadiness(store, new Map()),
        ),
        original = readiness.inspect,
        host = new RunnerIntegrationStages(store, readiness)
      context.signal = abort.signal
      let entered = () => {},
        release = () => {}
      const pending = new Promise<void>((resolve) => {
          entered = resolve
        }),
        continuation = new Promise<void>((resolve) => {
          release = resolve
        })
      readiness.inspect = async (...args) => {
        entered()
        await continuation
        return original.apply(readiness, args)
      }
      const before = contractDigest(store.lifecycle.journal.events()),
        result = host.execute(
          context,
          {
            schema: 'wholeloop/integration-verification-request@1',
            candidate: 'a'.repeat(64),
            assembly: 'b'.repeat(64),
            environment: `environment-${'c'.repeat(32)}`,
          },
          {
            provenance: 'host-observed',
            async call() {
              throw new Error('No native command allowed')
            },
          },
        )
      await pending
      abort.abort()
      context.signal = new AbortController().signal
      context.deadline = new Date(Date.now() + 60000).toISOString()
      release()
      await expect(result).rejects.toThrow('integration-stage-not-current')
      expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
    },
    { singleUnit: true },
  ))

it('requires the fixed assembly reader from the exact original store', () =>
  runnerGitFixture(
    async ({ store }) => {
      const foreign = new RunnerStore(join(store.files.root, 'foreign-reader')),
        readiness = new RunnerAssemblyReadiness(
          foreign,
          new RunnerMilestoneReadiness(foreign, new Map()),
        )
      expect(() => new RunnerIntegrationStages(store, readiness)).toThrow(
        'integration-stage-fixed-readiness-required',
      )
    },
    { singleUnit: true },
  ))
