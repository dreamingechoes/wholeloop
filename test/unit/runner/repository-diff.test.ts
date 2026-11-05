import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { observeAssertion } from '../../../src/acceptance/assertions.js'
import type { AcceptanceCase } from '../../../src/acceptance/contracts.js'
import { DockerRepositoryDiffHost } from '../../../src/acceptance/docker-repository-diff.js'
import {
  observeRepositoryDiff,
  parseRepositoryDiff,
  repositoryDiffArguments,
} from '../../../src/acceptance/repository-diff.js'
import {
  repositoryDiffFixture,
  repositoryDiffInput,
} from '../../../src/acceptance/repository-diff-input.js'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { EnvironmentCandidate } from '../../../src/environment/candidates.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { assertRepositoryDiffOwnership } from '../../../src/runner/repository-diff-observation.js'
import type { RunnerStore } from '../../../src/runner/store.js'
import { git } from '../../support/delivery.js'
import { runnerEnvironmentFixture } from '../../support/runner-environment.js'

function scopeCase(base = 'a'.repeat(40)): AcceptanceCase {
  return {
    id: 'scope',
    criteria: ['search'],
    owner: 'machine',
    applicability: 'applicable',
    rationale: 'Verify complete scope independently of worker reports.',
    initial: 'An original base and candidate are pinned.',
    actions: ['Compare the complete committed trees.'],
    failureConditions: ['An additional changed path fails.'],
    assertions: [
      {
        id: 'paths',
        description: 'Only status changes.',
        subject: 'json',
        operator: 'equals',
        path: '/changedPaths',
        expected: '["status.txt"]',
      },
    ],
    runner: {
      kind: 'cli',
      capability: 'repository.diff',
      input: JSON.stringify({ schema: 'wholeloop/repository-diff-input@1', repository: 'app' }),
    },
    fixture: repositoryDiffFixture('app', base),
    timeoutMs: 10000,
  }
}

function candidateEnvironment(
  store: RunnerStore,
  original: string,
  candidate: EnvironmentCandidate,
) {
  const records = new EnvironmentResources(store.files),
    environment = `environment-${'b'.repeat(32)}`
  records.create({
    ...records.get(original).record,
    id: environment,
    candidates: [{ ...candidate, content: contractDigest([]) }],
  })
  return environment
}

describe('controller-owned repository scope observations', () => {
  it('observes actual Git, retains original owners and refuses copied or missing receipt evidence', () =>
    runnerEnvironmentFixture(
      async ({ store, scope, context, environment: seedEnvironment, driver }) => {
        const declared = context.plan.repositories[0]
        if (!declared) throw new Error('Fixture repository missing')
        const path = store.files.path('scope-worktree')
        git(declared.root, ['worktree', 'add', '-b', 'wl/scope', path, declared.base])
        writeFileSync(join(path, 'status.txt'), 'ready\n')
        git(path, ['add', 'status.txt'])
        git(path, ['commit', '-m', 'test: prepare bounded candidate'])
        const snapshot = workspaceSnapshot(path),
          candidate = { repository: 'app', path, head: snapshot.head, snapshot: snapshot.digest },
          binding = { ...candidate, base: declared.base },
          test = scopeCase(declared.base),
          acceptance = new DeliveryAcceptance(store.files.root),
          pinned = acceptance.prepare({
            schema: 'wholeloop/acceptance-plan@1',
            run: context.request.run,
            revision: context.request.revision,
            plan: context.request.plan,
            source: context.plan.source,
            cases: [test],
            retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
          })
        const before = contractDigest(store.lifecycle.journal.events())
        expect(
          () =>
            new DockerRepositoryDiffHost([
              acceptance,
              pinned.digest,
              seedEnvironment,
              test.id,
              driver,
            ]),
        ).toThrow('repository-diff-owner-unavailable')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        const environment = candidateEnvironment(store, seedEnvironment, candidate)
        const bindings = {
            environment,
            recipe: 'b'.repeat(64),
            runtime: 'c'.repeat(64),
            candidates: [{ repository: 'app', head: candidate.head, snapshot: candidate.snapshot }],
          },
          receipt = await scope.run(context, environment, driver, async (_driver, reader) =>
            acceptance.executeCase(
              pinned.digest,
              test.id,
              'original-scope',
              {
                provenance: 'fixture',
                async observe() {
                  return structuredClone(bindings)
                },
              },
              {
                id: 'docker-repository-diff',
                version: '1',
                capability: 'repository.diff',
                provenance: 'fixture',
                async execute(test, caseContext) {
                  // Only the committed-Git/readback component is under test here;
                  // actual Docker/effect integration has a separate route evaluation.
                  const collected = await observeRepositoryDiff(
                      binding,
                      caseContext,
                      reader,
                      () => {
                        if (!context.current()) throw new Error('Fenced')
                      },
                    ),
                    artifact = caseContext.capture(
                      Buffer.from(JSON.stringify(collected)),
                      'application/json',
                    ),
                    assertions = test.assertions.map((assertion) => {
                      const observed = observeAssertion(assertion, {
                        application: {
                          code: 0,
                          stdout: JSON.stringify(collected.observation),
                          stderr: '',
                        },
                        requests: [],
                      })
                      return { id: observed.id, status: observed.status, evidence: artifact }
                    })
                  return {
                    status: assertions.every((assertion) => assertion.status === 'passed')
                      ? 'passed'
                      : 'failed',
                    origin: 'controller-observation',
                    invocationState: 'stopped',
                    assertions,
                    artifacts: [artifact],
                    reason: 'Observed committed Git component with original private readers.',
                  }
                },
              },
            ),
          ),
          artifact = receipt.artifacts[0]
        expect(receipt.status, receipt.reason).toBe('passed')
        expect(acceptance.observedCase(pinned.digest, test.id, 'original-scope')).toEqual(receipt)
        if (!artifact) throw new Error('Original read artifact missing')
        const result = JSON.parse(
          acceptance.artifacts.bytes(context.request.run, artifact).toString('utf8'),
        ) as Awaited<ReturnType<typeof observeRepositoryDiff>>
        expect(result.observation).toMatchObject({
          base: declared.base,
          head: snapshot.head,
          baseAncestor: true,
          changedPaths: ['status.txt'],
          changes: [
            {
              path: 'status.txt',
              status: 'A',
              before: { mode: '000000' },
              after: { mode: '100644' },
            },
          ],
        })
        const closed = scope.inspect(),
          audit = (execution: unknown, reads = closed.reads) =>
            assertRepositoryDiffOwnership(
              store,
              context.invocation,
              environment,
              test,
              receipt,
              execution,
              reads,
              context.deadline,
            )
        expect(closed.invocationState).toBe('stopped')
        expect(closed.reads).toHaveLength(6)
        expect(() => audit(result.execution)).not.toThrow()
        for (const mode of ['case', 'order', 'evidence', 'foreign', 'source'] as const) {
          const altered = structuredClone(result.execution)
          if (mode === 'case') altered.invocation = contractDigest('another-case')
          if (mode === 'order') altered.calls.reverse()
          if (mode === 'evidence' && altered.calls[0]) altered.calls[0].evidence = 'f'.repeat(64)
          if (mode === 'foreign' && altered.calls[0])
            altered.calls[0].invocation = closed.reads[1]?.invocation ?? ''
          if (mode === 'source') altered.source.base = 'f'.repeat(40)
          expect(() => audit(altered)).toThrow('integration-stage-original-git-owner')
        }
        expect(() => audit(result.execution, closed.reads.slice(1))).toThrow(
          'integration-stage-original-git-owner',
        )
        const callsBefore = scope.inspect().reads.length
        expect(() => audit(result.execution)).not.toThrow()
        expect(scope.inspect().reads).toHaveLength(callsBefore)
      },
    ))

  it.each(['cancelled', 'expired', 'fenced', 'foreign', 'ended'] as const)(
    'refuses %s repository reads before spawning',
    (mode) =>
      runnerEnvironmentFixture(
        async ({ store, scope, context, environment: seedEnvironment, driver }) => {
          const declared = context.plan.repositories[0]
          if (!declared) throw new Error('Fixture repository missing')
          const snapshot = workspaceSnapshot(declared.root)
          const environment = candidateEnvironment(store, seedEnvironment, {
            repository: 'app',
            path: declared.root,
            head: snapshot.head,
            snapshot: snapshot.digest,
          })
          const abort = new AbortController()
          context.signal = abort.signal
          let late: (() => Promise<unknown>) | undefined
          await scope.run(context, environment, driver, async (_driver, reader) => {
            const read = () =>
              reader(mode === 'foreign' ? 'other' : 'app', 'head', {
                invocation: contractDigest('case'),
                deadline: context.deadline,
                signal: abort.signal,
              })
            if (mode === 'ended') {
              late = read
              return
            }
            if (mode === 'cancelled') abort.abort()
            if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
            if (mode === 'fenced') context.current = () => false
            await expect(read()).rejects.toThrow('environment-repository-read-unavailable')
          })
          if (late) await expect(late()).rejects.toThrow('environment-repository-read-unavailable')
          expect(scope.inspect().reads).toHaveLength(0)
        },
      ),
  )
})

describe('complete committed diff decoding and declared inputs', () => {
  const oid = 'a'.repeat(40),
    other = 'b'.repeat(40),
    raw = (path: string, status = 'M', before = '100644', after = '100644') =>
      `:${before} ${after} ${oid} ${other} ${status}\0${path}\0`
  it('retains every added, deleted, modified and mode/type changed object in sorted order', () => {
    const result = parseRepositoryDiff(
      raw('z.txt') +
        raw('added', 'A', '000000') +
        raw('deleted', 'D', '100644', '000000') +
        raw('type', 'T', '100644', '120000') +
        raw('mode', 'M', '100644', '100755'),
    )
    expect(result.map((change) => change.path)).toEqual([
      'added',
      'deleted',
      'mode',
      'type',
      'z.txt',
    ])
    expect(result.find((change) => change.path === 'mode')).toMatchObject({
      before: { mode: '100644', oid },
      after: { mode: '100755', oid: other },
    })
    expect(parseRepositoryDiff('')).toEqual([])
  })
  it.each([
    'unterminated',
    '\uFFFD\0',
    raw('../escape'),
    raw('/absolute'),
    raw('.git/config'),
    raw('a\nb'),
    raw('same') + raw('same'),
    raw('renamed', 'R100'),
    `${raw('path')}orphan\0`,
  ])('refuses incomplete or ambiguous raw output %#', (input) =>
    expect(() => parseRepositoryDiff(input)).toThrow(),
  )
  it.each(['path', 'base', 'head', 'argv'] as const)(
    'does not accept worker-selected %s',
    (key) => {
      const test = scopeCase()
      test.runner.input = JSON.stringify({ ...JSON.parse(test.runner.input), [key]: 'untrusted' })
      expect(() => repositoryDiffInput(test)).toThrow()
    },
  )
  it.each(['/__proto__', '/constructor/value', '/~2', 'relative'])(
    'refuses unsupported JSON pointer %s',
    (path) => {
      const test = scopeCase()
      if (test.assertions[0]) test.assertions[0].path = path
      expect(() => repositoryDiffInput(test)).toThrow('unsupported-repository-diff-assertion')
    },
  )
  it('refuses uninstalled semantic assertions and revision options', () => {
    const test = scopeCase()
    if (test.assertions[0]) test.assertions[0].subject = 'stdout'
    expect(() => repositoryDiffInput(test)).toThrow('unsupported-repository-diff-assertion')
    expect(() => repositoryDiffArguments('diff', '--output=outside', 'b'.repeat(40))).toThrow(
      'repository-diff-revision',
    )
  })
  it.each(['dirty', 'head', 'binding', 'config', 'unknown', 'overflow', 'cancelled'] as const)(
    'refuses %s observations without manufacturing a scope verdict',
    async (mode) => {
      const expected = {
        repository: 'app',
        path: '/owned/candidate',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        snapshot: 'c'.repeat(64),
      }
      let calls = 0
      await expect(
        observeRepositoryDiff(
          expected,
          {
            invocation: 'd'.repeat(64),
            deadline: new Date(Date.now() + 10000).toISOString(),
            signal: new AbortController().signal,
          },
          async (_repository, operation) => {
            calls++
            return {
              status: mode === 'overflow' ? 'overflow' : 'succeeded',
              code: 0,
              signal: null,
              stdout:
                operation === 'head'
                  ? mode === 'head'
                    ? 'f'.repeat(40)
                    : expected.head
                  : operation === 'status' && mode === 'dirty'
                    ? '?? extra.txt\0'
                    : operation === 'configuration' && mode === 'config'
                      ? 'core.hooksPath\0'
                      : '',
              binding: mode === 'binding' ? { ...expected, base: 'f'.repeat(40) } : expected,
              ownership: {
                invocation: 'e'.repeat(64),
                invocationState: mode === 'unknown' ? 'unknown' : 'stopped',
                evidence: 'f'.repeat(64),
              },
            }
          },
          () => {
            if (mode === 'cancelled') throw new Error('Original case cancelled')
          },
        ),
      ).rejects.toThrow()
      expect(calls).toBeLessThan(6)
    },
  )
})
