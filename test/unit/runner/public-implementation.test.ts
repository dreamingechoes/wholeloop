import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { PublicBuildPlanInputs } from '../../../src/runner/public-build-plan-inputs.js'
import { composePublicHost, runtimeGithub } from '../../../src/runner/public-composition.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import {
  publicBindings as bindings,
  DELEGATED,
  prepareSuiteRecipe,
  REPOSITORY,
  SEED,
  SYNTHETIC_CODEX,
  toPr,
} from '../../support/public-implementation.js'
import { runnerGitFixture } from '../../support/runner-git.js'

describe('public to-pr composition (ADR-0207)', () => {
  it('runs the runtime gh binary and leaves git to the core', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-public-gh-'))),
      log = join(dir, 'gh.log')
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2)))\nconsole.log('{}')\n`,
    )
    chmodSync(join(dir, 'gh'), 0o700)
    const execute = runtimeGithub(join(dir, 'gh'))
    await execute('gh', ['pr', 'ready', '--', 'https://github.com/fixture/app/pull/1'], dir)
    expect(JSON.parse(readFileSync(log, 'utf8'))).toEqual([
      'pr',
      'ready',
      '--',
      'https://github.com/fixture/app/pull/1',
    ])
    expect(await execute('git', ['--version'], dir)).toMatch(/^git version /)
  })
  it('composes the whole route and nothing without a code host', async () => {
    await runnerGitFixture(
      async ({ store, request, root }) => {
        const plan = store.basis(request).plan,
          recipe = prepareSuiteRecipe(store.files.root, root),
          runtime: NativeRuntime = {
            schema: 'wholeloop/native-runtime@1',
            clients: [
              { target: 'codex', client: '/opt/fixture/codex', store: '/opt/fixture/home' },
            ],
            repositories: [REPOSITORY(recipe)],
            codeHost: { kind: 'github-cli', client: '/opt/fixture/gh' },
          },
          stages = runnerRoute(plan),
          host = composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: { bindings, runtime },
          })
        expect(host).toBeInstanceOf(RunnerStageDispatcher)
        const coverage = (host as RunnerStageDispatcher).coverage(plan)
        expect(
          stages.filter((stage) => !coverage.unsupported.includes(stage.id)).map((s) => s.id),
        ).toEqual([
          'plan',
          'acceptance-definition',
          'workspace:search',
          'build-plan:search',
          'implementation:search',
          'commit:search',
          'verification:search',
          'review:search',
          'reverification:search',
          'integration:feature',
          'acceptance',
          'publication',
          'handoff',
        ])
        expect(coverage.complete).toBe(true)
        // A continuation route adds correction-1 and is covered as a whole (ADR-0208).
        const continuation = {
          ...plan,
          revision: 2,
          corrections: [
            {
              unit: 'search',
              origin: 'integration' as const,
              request: 'a'.repeat(64),
              stage: 'integration:feature',
              failure: 'b'.repeat(64),
            },
          ],
        }
        expect(runnerRoute(continuation).some((stage) => stage.id === 'correction-1:search')).toBe(
          true,
        )
        expect((host as RunnerStageDispatcher).coverage(continuation).complete).toBe(true)
        expect(
          await host?.preflight(request, plan, stages, new AbortController().signal),
        ).toMatchObject({ available: true, interactive: 'disabled' })
        const { codeHost: _codeHost, ...withoutGithub } = runtime
        expect(
          composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: { bindings, runtime: withoutGithub },
          }),
        ).toBeUndefined()
        // A recipe with data volumes, no repository inputs, no builder binding,
        // or a guidance pin whose bytes differ, composes nothing.
        expect(
          composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: {
              bindings,
              runtime: {
                ...runtime,
                repositories: [REPOSITORY(prepareSuiteRecipe(store.files.root, root, true))],
              },
            },
          }),
        ).toBeUndefined()
        expect(
          composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: {
              bindings,
              runtime: { ...runtime, repositories: [REPOSITORY(recipe, 'other')] },
            },
          }),
        ).toBeUndefined()
        expect(
          composePublicHost({
            store,
            request,
            plan,
            stages,
            configuration: {
              bindings: {
                ...bindings,
                bindings: bindings.bindings.map((b) => ({
                  ...b,
                  roles: ['planner', 'challenger', 'verifier', 'reviewer', 'refuter'],
                })),
              },
              runtime,
            },
          }),
        ).toBeUndefined()
        const changed = {
          ...plan,
          guidance: plan.guidance.map((pin) => ({ ...pin, sha256: 'c'.repeat(64) })),
        }
        expect(
          composePublicHost({
            store,
            request,
            plan: changed,
            stages,
            configuration: { bindings, runtime },
          }),
        ).toBeUndefined()
      },
      {
        singleUnit: true,
        seed: SEED,
        decisions: [...DELEGATED],
        configure: (plan, files) => toPr(plan, files),
      },
    )
  })
  it('runs plan to commit through the real Codex observer with no prompt', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-public-implementation-')))
    mkdirSync(join(dir, 'bin'))
    mkdirSync(join(dir, 'codex-home'), { mode: 0o700 })
    const log = join(dir, 'calls.jsonl')
    writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(log))
    chmodSync(join(dir, 'bin', 'codex'), 0o700)
    const runtime: NativeRuntime = {
      schema: 'wholeloop/native-runtime@1',
      clients: [
        { target: 'codex', client: join(dir, 'bin', 'codex'), store: join(dir, 'codex-home') },
      ],
    }
    await runnerGitFixture(
      async ({ store, request, digest, dispatch, observe, host: git, root }) => {
        const plan = store.basis(request).plan,
          // Verification is not executed here; the recipe is pinned, never provisioned.
          recipe = prepareSuiteRecipe(store.files.root, root),
          installed: NativeRuntime = {
            ...runtime,
            repositories: [REPOSITORY(recipe)],
            codeHost: { kind: 'github-cli', client: '/opt/fixture/gh' },
          },
          host = composePublicHost({
            store,
            request,
            plan,
            stages: runnerRoute(plan),
            configuration: {
              bindings,
              runtime: installed,
            },
          })
        if (!host) throw new Error('The front of the route must compose')
        for (const id of [
          'plan',
          'acceptance-definition',
          'workspace:search',
          'build-plan:search',
          'implementation:search',
          'commit:search',
        ]) {
          const current = dispatch(id),
            observed = await host.execute(current)
          expect(observed, `${id}: ${observed.reason}`).toMatchObject({ status: 'passed' })
          if (id !== 'plan' && id !== 'workspace:search' && id !== 'commit:search')
            expect(observed.provenance, id).toBe('host-observed')
          if (id === 'build-plan:search') {
            const binding = JSON.parse(
              readFileSync(
                store.files.path(`delivery/runner-artifacts/${current.invocation}.json`),
                'utf8',
              ),
            )
            const selected = binding.lease.assignment.context.find(
              (entry: { kind: string }) => entry.kind === 'source',
            )
            expect(
              selected,
              'Planning needs selected source and its pinned acceptance prerequisite',
            ).toBeDefined()
            const inputs = JSON.parse(
              readFileSync(join(binding.lease.contextRoot, selected.artifact.ref), 'utf8'),
            )
            expect(inputs.acceptance.production).toMatchObject({
              stage: 'acceptance-definition',
              provenance: 'host-observed',
              status: 'passed',
            })
            expect(inputs.acceptance.cases.length).toBeGreaterThan(0)
            expect(inputs.acceptance.digest).toBe(
              new DeliveryAcceptance(store.files.root).pinnedFor(request.run, plan.revision).digest,
            )
            for (const entry of inputs.acceptance.cases)
              expect(Object.keys(entry).sort()).toEqual([
                'applicability',
                'criteria',
                'id',
                'owner',
              ])
            expect(inputs.repository.files.map((file: { path: string }) => file.path)).toEqual([
              'app.cjs',
              'package.json',
              'suite.cjs',
            ])
            expect(
              inputs.repository.files.some(
                (file: { path: string; text: string }) =>
                  file.path === 'app.cjs' && file.text === SEED['app.cjs'],
              ),
            ).toBe(true)
            const decision = JSON.parse(
              readFileSync(
                store.files.path(`delivery/runner-decisions/${current.invocation}.json`),
                'utf8',
              ),
            )
            const reader = new PublicBuildPlanInputs(store, installed),
              artifact = reader.read(current),
              original = readFileSync(store.files.path(artifact.ref), 'utf8'),
              eventCount = store.lifecycle.journal.events().length,
              callCount = new RunnerNativeScope(store.files, current.invocation).calls().length
            expect(decision.requests[0].artifacts).toContainEqual(artifact)
            expect(decision.requests[0].evidence).toContainEqual({
              id: 'build-plan-inputs',
              ...artifact,
            })
            expect(reader.prepare(current).context.artifact).toEqual(selected.artifact)
            for (const changed of [
              { ...current, current: () => false },
              { ...current, invocation: 'f'.repeat(64) },
              { ...current, stage: { ...current.stage, unit: 'foreign' } },
              { ...current, plan: { ...current.plan, revision: current.plan.revision + 1 } },
            ])
              expect(() => reader.read(changed)).toThrow()
            store.files.atomic(artifact.ref, `${original} `)
            expect(() => reader.read(current)).toThrow('public-build-plan-inputs-changed')
            expect(() => reader.prepare(current)).toThrow('public-build-plan-inputs-changed')
            expect(readFileSync(store.files.path(artifact.ref), 'utf8')).toBe(`${original} `)
            store.files.atomic(artifact.ref, original)
            const workspace = git.workspace(request, 'search').repository.path,
              sourcePath = join(workspace, 'app.cjs'),
              source = readFileSync(sourcePath)
            try {
              writeFileSync(sourcePath, `${source.toString()}\n`)
              expect(() => reader.read(current)).toThrow('public-build-plan-inputs-changed')
              writeFileSync(sourcePath, 'x'.repeat(128 * 1024 + 1))
              expect(() => reader.read(current)).toThrow()
            } finally {
              writeFileSync(sourcePath, source)
            }
            renameSync(sourcePath, `${sourcePath}.retained`)
            try {
              symlinkSync(join(root, 'app.cjs'), sourcePath)
              expect(() => reader.read(current)).toThrow()
            } finally {
              unlinkSync(sourcePath)
              renameSync(`${sourcePath}.retained`, sourcePath)
            }
            expect(reader.read(current)).toEqual(artifact)
            expect(store.lifecycle.journal.events()).toHaveLength(eventCount)
            expect(new RunnerNativeScope(store.files, current.invocation).calls()).toHaveLength(
              callCount,
            )
          }
          observe(observed)
        }
        const candidate = git.candidate(request, 'search')
        expect(readFileSync(join(candidate.allocation.repository.path, 'app.txt'), 'utf8')).toBe(
          'Synthetic public implementation.\n',
        )
        for (const id of ['acceptance-definition', 'build-plan:search', 'implementation:search']) {
          const record = store.stage(digest, id)
          if (record)
            expect(
              new RunnerNativeScope(store.files, record.invocation)
                .inspect()
                .every((call) => call.observed.invocationState === 'stopped'),
            ).toBe(true)
        }
        const calls = readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as string[]),
          launches = calls.filter((args) => args.includes('exec')).length
        // The acceptance-plan producer, the build-plan producer with its judge
        // and challenger, and one builder; acceptance definition is not delegated.
        expect(launches).toBe(5)
        expect(calls.filter((args) => args.includes('sandbox')).length).toBe(2 * launches)
        expect(calls.filter((args) => args.includes('login')).length).toBe(launches)
      },
      {
        singleUnit: true,
        seed: SEED,
        decisions: [...DELEGATED],
        configure: (plan, files) => toPr(plan, files),
      },
    )
  })
})
