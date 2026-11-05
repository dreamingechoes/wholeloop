import { describe, expect, it } from 'vitest'
import { behaviorInput } from '../../../src/acceptance/behavior-input.js'
import type { AcceptanceCase } from '../../../src/acceptance/contracts.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { publicAcceptanceContext } from '../../../src/runner/public-acceptance-context.js'
import { prepareSuiteRecipe, REPOSITORY, SEED } from '../../support/public-implementation.js'
import { runnerGitFixture } from '../../support/runner-git.js'

describe('installed public acceptance production context', () => {
  it('describes actual recipe identities and inputs accepted by the installed behavior parser without issuing work', async () => {
    await runnerGitFixture(
      async ({ store, request, root }) => {
        const plan = store.basis(request).plan,
          recipe = prepareSuiteRecipe(store.files.root, root),
          runtime: NativeRuntime = {
            schema: 'wholeloop/native-runtime@1',
            clients: [],
            repositories: [REPOSITORY(recipe)],
          },
          before = contractDigest(store.lifecycle.journal.events()),
          context = publicAcceptanceContext(store, plan, runtime)
        if (!context) throw new Error('Expected installed acceptance context')
        expect(context.inputSchema.$id).toBe('wholeloop/behavior-input@1')
        expect(context.runners.map((runner) => runner.capability)).toEqual([
          'process.exec',
          'http.request',
        ])
        const fixture = context.fixtures[0]
        expect(fixture?.fixture).toEqual({ ref: `recipe:${recipe}`, sha256: recipe })
        expect(fixture?.services).toContainEqual({ id: 'web', ports: [3000], commands: ['suite'] })
        for (const kind of ['cli', 'api'] as const) {
          const input =
              kind === 'cli'
                ? { schema: 'wholeloop/behavior-input@1', kind, service: 'web', command: 'suite' }
                : {
                    schema: 'wholeloop/behavior-input@1',
                    kind,
                    service: 'web',
                    port: 3000,
                    steps: [{ id: 'read', kind: 'request', method: 'GET', path: '/' }],
                  },
            test: AcceptanceCase = {
              id: 'installed-input',
              criteria: ['search'],
              owner: 'machine',
              applicability: 'applicable',
              rationale: 'Check the declared input contract, without executing it.',
              initial: 'The installed recipe declares this service and command.',
              actions: ['Select the installed observation input.'],
              assertions: [
                {
                  id: 'result',
                  description: 'Observe the result through the installed host.',
                  subject: kind === 'cli' ? 'exit' : 'status',
                  operator: 'equals',
                  expected: kind === 'cli' ? '0' : '200',
                },
              ],
              failureConditions: ['An unsupported input must refuse.'],
              runner: {
                kind,
                capability: kind === 'cli' ? 'process.exec' : 'http.request',
                input: JSON.stringify(input),
              },
              fixture: fixture?.fixture ?? { ref: '', sha256: '' },
              timeoutMs: 5000,
            }
          expect(behaviorInput(test)).toEqual(input)
        }
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        context.inputSchema.properties.kind.enum.push('semantic')
        expect(
          publicAcceptanceContext(store, plan, runtime)?.inputSchema.properties.kind.enum,
        ).toEqual(['cli', 'api'])
      },
      { seed: SEED },
    )
  })
  it('does not invent fixture support for missing or unavailable recipes', async () => {
    await runnerGitFixture(async ({ store, request }) => {
      const plan = store.basis(request).plan,
        runtime: NativeRuntime = { schema: 'wholeloop/native-runtime@1', clients: [] }
      expect(publicAcceptanceContext(store, plan, runtime)).toBeUndefined()
      runtime.repositories = [REPOSITORY('f'.repeat(64))]
      expect(publicAcceptanceContext(store, plan, runtime)).toBeUndefined()
    })
  })
})
