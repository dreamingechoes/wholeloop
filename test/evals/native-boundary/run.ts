import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { CodexBoundaryHost } from '../../../src/delivery/native-codex-boundary.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { fixture, git } from '../../support/delivery.js'
import { nativeBoundaryInput } from '../../support/native-boundary.js'

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-native-boundary-')))
const observations: unknown[] = []
await fixture(
  async ({ planning, root, dir }) => {
    const files = planning.sources.files,
      workspace = join(dir, 'boundary-worktree')
    git(root, ['worktree', 'add', '-b', 'boundary-control', workspace, 'main'])
    const before = workspaceSnapshot(workspace).digest
    const cases = (['planner', 'builder', 'verifier'] as const).flatMap((role) =>
      (['inline-proposal', 'files'] as const).map((output) => ({ role, output })),
    )
    for (const { role, output } of cases) {
      const { input, nativeStore } = nativeBoundaryInput(
          files,
          dir,
          role,
          role === 'planner' ? undefined : workspace,
          output,
        ),
        controls: {
          status: string
          code: number | null
          ownership: string
          stdout: string
          diagnostic: string
        }[] = [],
        host = new CodexBoundaryHost(files, {
          path: process.env.PATH ?? '',
          nativeStore,
          output,
          provenance: 'host-observed',
          current: () => true,
          ...(role === 'planner' ? {} : { workspace }),
          process: async (command, args, options) => {
            let diagnostic = ''
            const result = await new ManagedRunnerProcess(
              files,
              contractDigest({ control: randomUUID() }),
            ).invoke(command, args, options.input, {
              ...options,
              current: () => true,
              observe: (stream, bytes) => {
                if (stream === 'stderr' && diagnostic.length < 4096)
                  diagnostic += bytes.toString('utf8').slice(0, 4096 - diagnostic.length)
                options.observe?.(stream, bytes)
              },
            })
            controls.push({
              status: result.status,
              code: result.code,
              ownership: result.ownership.invocationState,
              stdout: result.stdout.slice(0, 16384),
              diagnostic,
            })
            return result
          },
        })
      // Never call observe/login, load personal credentials or invoke a model.
      // The credential reference is a new empty directory owned by this control.
      const observed = await host.probePolicy(input),
        unchanged = workspaceSnapshot(workspace).digest === before
      observations.push({
        role,
        output,
        observed: observed ?? null,
        controls,
        unchanged,
        store: files.root,
      })
      writeFileSync(
        join(directory, 'report.json'),
        `${JSON.stringify({ observations, nativeAcceptance: 'not-established', model: 'not-invoked', authentication: 'not-observed' }, null, 2)}\n`,
      )
      console.log(
        JSON.stringify({
          retained: directory,
          role,
          output,
          observed: observed ?? null,
          unchanged,
          model: 'not-invoked',
          authentication: 'not-observed',
        }),
      )
      assert.ok(
        observed,
        'The installed reference client must pass actual policy and cancellation probes',
      )
      assert.equal(observed.authenticated, false)
      assert.ok(Object.values(observed.boundary).every(Boolean))
      assert.ok(unchanged, 'Policy witnesses must not change project bytes')
    }
  },
  { retain: true },
)
