import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { ClaudeBoundaryHost } from '../../../src/delivery/native-claude-boundary.js'
import type { NativeClaudeContainment } from '../../../src/delivery/native-claude-sandbox.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { fixture, git } from '../../support/delivery.js'
import { nativeBoundaryInput } from '../../support/native-boundary.js'

// The operator's dedicated client home, signed in once (manual verification,
// 2026-11-03). Resolved at run time; WHOLELOOP_CLAUDE_STORE overrides it.
const store = realpathSync(
    process.env.WHOLELOOP_CLAUDE_STORE ??
      join(homedir(), '.local', 'state', 'wholeloop-native', 'claude'),
  ),
  client = process.env.WHOLELOOP_CLAUDE_CLIENT,
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-claude-boundary-')))
assert.ok(client, 'Set WHOLELOOP_CLAUDE_CLIENT to the canonical installed client binary')
const containment: NativeClaudeContainment = {
  kind: 'macos-sandbox',
  credential: 'keychain',
  sandbox: '/usr/bin/sandbox-exec',
  client: realpathSync(client),
  home: realpathSync(homedir()),
  user: userInfo().username,
  store,
}
const observations: unknown[] = []
await fixture(
  async ({ planning, root, dir }) => {
    const files = planning.sources.files,
      workspace = join(dir, 'boundary-worktree')
    git(root, ['worktree', 'add', '-b', 'boundary-control', workspace, 'main'])
    const before = workspaceSnapshot(workspace).digest
    for (const role of ['planner', 'builder', 'verifier'] as const)
      for (const output of ['inline-proposal', 'files'] as const) {
        const { input } = nativeBoundaryInput(
            files,
            dir,
            role,
            role === 'planner' ? undefined : workspace,
            output,
            containment,
          ),
          controls: { status: string; code: number | null; ownership: string }[] = [],
          host = new ClaudeBoundaryHost(files, {
            path: '/usr/bin:/bin',
            containment,
            output,
            provenance: 'host-observed',
            current: () => true,
            ...(role === 'planner' ? {} : { workspace }),
            process: async (command, args, options) => {
              const result = await new ManagedRunnerProcess(
                files,
                contractDigest({ control: randomUUID() }),
              ).invoke(command, args, options.input, { ...options, current: () => true })
              controls.push({
                status: result.status,
                code: result.code,
                ownership: result.ownership.invocationState,
              })
              return result
            },
          })
        // Never invokes a model: version, the sandboxed probe, cancellation and
        // the client's own local login status are the only processes.
        const observed = await host.observe(input),
          unchanged = workspaceSnapshot(workspace).digest === before
        observations.push({ role, output, observed: observed ?? null, controls, unchanged })
        console.log(
          JSON.stringify({ role, output, observed: observed ?? null, controls, unchanged }),
        )
        assert.ok(observed, 'The installed client must pass the sandboxed probes')
        assert.equal(observed.authenticated, true)
        assert.ok(Object.values(observed.boundary).every(Boolean))
        assert.ok(unchanged, 'Policy witnesses must not change project bytes')
      }
    writeFileSync(
      join(directory, 'report.json'),
      `${JSON.stringify({ observations, model: 'not-invoked' }, null, 2)}\n`,
    )
  },
  { retain: true },
)
