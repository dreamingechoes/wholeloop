import { type SpawnSyncReturns, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import {
  guardCommit,
  guardPush,
  guardStateWrite,
  guardTool,
  type PushInput,
} from '../../../src/guards/assess.js'
import { gitInvocation, simpleWords } from '../../../src/guards/command.js'
import { gitGuards } from '../../../src/guards/git-hooks.js'
import { normalizeTool } from '../../../src/guards/normalize.js'
import { PullRequestWorkflow } from '../../../src/pull-requests/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import { WorktreeManager } from '../../../src/worktrees/manager.js'

const corePath = resolve('dist/wl.mjs')
const core = () => readFileSync(corePath, 'utf8')
const gitEnv = (dir: string) => ({
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
  GIT_SSH_VARIANT: 'ssh',
})
async function fixture(
  run: (context: {
    dir: string
    root: string
    store: StateStore
    engine: FlowEngine
    command: (...args: string[]) => SpawnSyncReturns<string>
    git: (...args: string[]) => string
  }) => unknown | Promise<unknown>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-guards-'))
  const root = join(dir, 'repository with spaces')
  mkdirSync(root)
  const priorGlobal = process.env.GIT_CONFIG_GLOBAL
  const priorSystem = process.env.GIT_CONFIG_NOSYSTEM
  process.env.GIT_CONFIG_GLOBAL = join(dir, 'no-global-config')
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  const command = (...args: string[]) =>
    spawnSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnv(dir), timeout: 15000 })
  const git = (...args: string[]) => {
    const result = command(...args)
    if (result.status !== 0) throw new Error(`Fixture Git failed: ${result.stderr}`)
    return result.stdout.trim()
  }
  try {
    git('init', '-b', 'main')
    git('config', 'user.name', 'Fixture')
    git('config', 'user.email', 'fixture@example.com')
    git('config', 'core.hooksPath', '/dev/null')
    writeFileSync(join(root, 'a.txt'), 'base\n')
    mkdirSync(join(root, '.wholeloop'))
    writeFileSync(
      join(root, '.wholeloop/config.yml'),
      'version: 1\nproviders:\n  codehost: github\n',
    )
    git('add', '.')
    git(
      'commit',
      '-m',
      'chore: seed guard fixture',
      '-m',
      'Pin an isolated repository for guard policy tests.',
    )
    git('config', '--unset-all', 'core.hooksPath')
    const store = new StateStore(join(dir, 'state/wholeloop'))
    const engine = new FlowEngine(store, root, join(dir, 'config/config.yml'), join(dir, 'home'))
    await run({ dir, root, store, engine, command, git })
  } finally {
    if (priorGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = priorGlobal
    if (priorSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM
    else process.env.GIT_CONFIG_NOSYSTEM = priorSystem
    rmSync(dir, { recursive: true, force: true })
  }
}
function native(root: string, command: string, subject?: string) {
  return normalizeTool(
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: root, tool_input: { command } },
    root,
    subject,
  )
}
async function pending(engine: FlowEngine, git: (...args: string[]) => string) {
  git('switch', '-c', 'feature/guarded')
  git(
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--allow-empty',
    '-m',
    'fix: prepare fixture publication',
    '-m',
    'Distinguish the tested topic from its named base.',
  )
  git('remote', 'add', 'origin', 'git@github.com:example/product.git')
  const workflow = new PullRequestWorkflow(engine)
  const prepared = workflow.prepare({
    owner: 'Owner',
    base: 'main',
    title: 'fix: validate guarded publication',
    body: '# Change\n\n## Summary\nKeep the approved change.\n\n## Validation\nOwner inspected the exact fixture.\n',
  })
  if (!('draft' in prepared)) throw new Error('Expected fixture plan')
  workflow.tested(prepared.subject, 'Owner', 'Inspect the exact pinned fixture')
  await workflow.publish(prepared.subject, {
    invoke: async () => ({
      status: 'pending',
      ref: 'https://github.com/example/product/pull/pending',
    }),
  })
  const plan = prepared.draft
  const input: PushInput = {
    cwd: engine.root,
    remote: 'origin',
    url: 'git@github.com:example/product.git',
    subject: prepared.subject,
    updates: [
      {
        localRef: plan.head,
        localSha: plan.head,
        remoteRef: `refs/heads/${plan.branch}`,
        remoteSha: '0'.repeat(plan.head.length),
      },
    ],
  }
  return { input, plan, subject: prepared.subject }
}

describe('shared hook policies and actual Git fallback', () => {
  it('normalizes authored native/SDK payload fixtures without claiming captured client conformance', async () =>
    fixture(({ root }) => {
      const examples = [
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'git commit -m "fix: fixture"' },
        },
        { event: 'before-tool', tool: 'bash', args: { command: 'git commit -m "fix: fixture"' } },
        {
          hookEventName: 'preToolUse',
          toolName: 'bash',
          toolArgs: '{"command":"git commit -m \\"fix: fixture\\""}',
        },
        { tool_name: 'functions.exec_command', arguments: { cmd: 'git commit -m "fix: fixture"' } },
      ]
      // Copilot command hooks carry a JSON string; the Codex-shaped SDK fixture is not a CLI hook claim.
      examples[2] = {
        hookEventName: 'preToolUse',
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'git commit -m "fix: fixture"' }),
      }
      const values = examples.map((value) => normalizeTool({ ...value, cwd: root }, root))
      for (const value of values) expect(value).toEqual(values[0])
      expect(() => normalizeTool({ toolName: 'bash', toolArgs: 'secret-input' }, root)).toThrow(
        'contents omitted',
      )
      expect(() =>
        normalizeTool({ tool: 'bash', event: 'PostToolUse', args: { command: 'true' } }, root),
      ).toThrow('Only before-tool')
    }))
  it('recognizes simple Git argv but never evaluates a shell program', () => {
    expect(simpleWords('git -C "path with spaces" commit -m \'fix: literal $text\'')).toEqual([
      'git',
      '-C',
      'path with spaces',
      'commit',
      '-m',
      'fix: literal $text',
    ])
    for (const text of [
      'git commit; git push',
      'git push | cat',
      'git commit -m "$(whoami)"',
      'git commit -m "`whoami`"',
      'git commit > file',
      'git commit\ntrue',
      'git commit "unfinished',
    ])
      expect(simpleWords(text)).toBeUndefined()
    expect(
      gitInvocation(
        'env A=value /usr/bin/git -C child -c core.hooksPath=/dev/null commit --no-verify',
        '/tmp',
      ),
    ).toMatchObject({ action: 'commit', cwd: '/tmp/child', bypass: true })
    expect(gitInvocation('git status', '/tmp')).toBeUndefined()
  })
  it('allows ordinary inspection without reading a broken journal and rejects explicit hook bypass', async () =>
    fixture(({ root }) => {
      const broken = () => {
        throw new Error('No journal access')
      }
      expect(
        guardTool(normalizeTool({ tool: 'Read', args: { path: 'a.txt' } }, root), broken).decision,
      ).toBe('allow')
      expect(guardTool(native(root, 'git commit --no-verify'), broken).policies).toEqual([
        'guard-bypass',
      ])
    }))
  it(
    'enforces assigned topics through native input and an installed pre-commit hook',
    async () =>
      fixture(({ root, dir, store, engine, command, git }) => {
        const id = store.create({
          kind: 'slice',
          title: 'Guard the assigned work',
          body: 'Commit only the assigned slice.',
          owner: 'Owner',
          repository: root,
        }).id
        const manager = new WorktreeManager(engine)
        const record = manager.create(id, { base: 'main' }).record
        expect(manager.open(id).environment.WL_SUBJECT).toBe(id)
        expect(
          guardTool(native(root, 'git commit -m "fix: fixture"', id), () => store.events())
            .decision,
        ).toBe('deny')
        expect(guardCommit(record.path, store.events(), id).decision).toBe('allow')
        expect(guardCommit(root, store.events()).decision).toBe('allow')
        gitGuards('install', root, core(), store.files.root)
        const denied = spawnSync(
          'git',
          ['commit', '--allow-empty', '-m', 'fix: refuse wrong checkout'],
          { cwd: root, encoding: 'utf8', env: { ...gitEnv(dir), WL_SUBJECT: id } },
        )
        expect(denied.status).not.toBe(0)
        expect(denied.stderr).toContain('operation denied')
        const accepted = spawnSync(
          'git',
          [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.com',
            'commit',
            '--allow-empty',
            '-m',
            'fix: use assigned topic',
          ],
          {
            cwd: record.path,
            encoding: 'utf8',
            env: { ...gitEnv(dir), WL_SUBJECT: id },
            timeout: 15000,
          },
        )
        expect(accepted.status, accepted.stderr).toBe(0)
        expect(command('branch', '--show-current').stdout.trim()).toBe('main')
        expect(git('rev-list', '--count', 'HEAD')).toBe('1')
      }),
    20000,
  )
  it('blocks repository runtime writes through native, store-boundary and staged Git paths', async () =>
    fixture(({ root, dir, store, command, git }) => {
      const path = join(root, '.wholeloop/state/journal.ndjson')
      expect(
        guardTool(
          normalizeTool({ tool: 'Write', args: { file_path: path, content: 'private' } }, root),
          () => [],
        ).decision,
      ).toBe('deny')
      expect(guardStateWrite(path).decision).toBe('deny')
      expect(
        guardTool(
          normalizeTool(
            { tool: 'wholeloop.state.write', args: { path: join(root, 'arbitrary-runtime') } },
            root,
          ),
          () => [],
        ).decision,
      ).toBe('deny')
      symlinkSync(root, join(dir, 'linked-repo'))
      expect(guardStateWrite(join(dir, 'linked-repo/runtime')).decision).toBe('deny')
      expect(guardStateWrite(join(dir, 'external/state')).decision).toBe('allow')
      expect(() => new StateStore(join(root, 'runtime'))).toThrow('outside git')
      gitGuards('install', root, core(), store.files.root)
      mkdirSync(join(root, '.wholeloop/state'))
      writeFileSync(path, 'fixture state\n')
      git('add', '.')
      expect(command('commit', '-m', 'chore: reject staged state').status).not.toBe(0)
      git('reset', 'HEAD', '--', '.wholeloop/state')
      git('add', '.wholeloop/config.yml')
      expect(guardCommit(root, store.events()).decision).toBe('allow')
    }))
  it('checks cross-repository write destinations and releases stopped checkout leases', async () =>
    fixture(({ root, dir, store, engine, git }) => {
      const runtime = join(root, '.wholeloop/state/event')
      expect(
        guardTool(normalizeTool({ tool: 'Write', args: { file_path: runtime } }, dir), () => [])
          .decision,
      ).toBe('deny')
      expect(guardTool(normalizeTool({ tool: 'Write', args: {} }, root), () => []).decision).toBe(
        'deny',
      )
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nbuild: {workspace: checkout}\n',
      )
      git('add', '.')
      git(
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '-m',
        'chore: select fixture checkout',
        '-m',
        'Verify that stopped leases do not block owner commits.',
      )
      const id = store.create({
        kind: 'slice',
        title: 'Use the fixture checkout',
        body: 'Check the stopped lease.',
        owner: 'Owner',
        repository: root,
      }).id
      const manager = new WorktreeManager(engine)
      manager.create(id, { base: 'main' })
      manager.stop(id)
      git('switch', 'main')
      expect(guardCommit(root, store.events()).decision).toBe('allow')
      expect(guardCommit(root, store.events(), id).decision).toBe('deny')
    }))
  it('accepts exact approved requests and refuses changed refs, destinations, work and remote history', async () =>
    fixture(async ({ engine, store, git, root }) => {
      const { input, plan } = await pending(engine, git)
      expect(guardPush(input, store.events()).decision).toBe('allow')
      expect(
        guardTool(native(root, `git push -- origin ${plan.head}:refs/heads/${plan.branch}`), () =>
          store.events(),
        ).decision,
      ).toBe('allow')
      expect(guardTool(native(root, 'git push origin HEAD'), () => store.events()).decision).toBe(
        'deny',
      )
      const update = input.updates[0]
      if (!update) throw new Error('Expected update')
      for (const changed of [
        { updates: [] },
        { updates: [update, update] },
        { updates: [{ ...update, localSha: '0'.repeat(40) }] },
        { updates: [{ ...update, remoteRef: 'refs/heads/main' }] },
        { updates: [{ ...update, localRef: 'HEAD' }] },
        { updates: [{ ...update, remoteSha: 'not-a-sha' }] },
        { remote: 'other' },
        { url: 'git@github.com:example/other.git' },
      ]) {
        let decision = 'deny'
        try {
          decision = guardPush({ ...input, ...changed }, store.events()).decision
        } catch {}
        expect(decision).toBe('deny')
      }
      expect(
        guardPush(
          input,
          store.events().filter((event) => event.type !== 'pr.requested'),
        ).decision,
      ).toBe('deny')
      const orphan = git('commit-tree', 'HEAD^{tree}', '-m', 'An unrelated remote history')
      expect(
        guardPush({ ...input, updates: [{ ...update, remoteSha: orphan }] }, store.events())
          .decision,
      ).toBe('deny')
      writeFileSync(join(root, 'a.txt'), 'changed after testing\n')
      expect(guardPush(input, store.events()).decision).toBe('deny')
    }))
  it(
    'executes a real object-pinned push to a disposable bare fixture and denies unplanned publication',
    async () =>
      fixture(async ({ engine, dir, root, store, command, git }) => {
        const { input, plan } = await pending(engine, git)
        const bare = join(dir, 'remote.git')
        const init = spawnSync('git', ['init', '--bare', bare], {
          encoding: 'utf8',
          env: gitEnv(dir),
        })
        expect(init.status).toBe(0)
        const transport = join(dir, 'ssh-fixture.mjs')
        writeFileSync(
          transport,
          `import { spawnSync } from 'node:child_process'\nif(!process.argv.at(-1).startsWith("git-receive-pack "))process.exit(1)\nconst env={...process.env};delete env.GIT_DIR;delete env.GIT_WORK_TREE;delete env.GIT_INDEX_FILE\nprocess.exit(spawnSync('git',['receive-pack',${JSON.stringify(bare)}],{stdio:'inherit',env}).status ?? 1)\n`,
        )
        git('config', 'core.sshCommand', `node '${transport.replaceAll("'", "'\\''")}'`)
        gitGuards('install', root, core(), store.files.root)
        const rejected = command('push', 'origin', `${plan.head}:refs/heads/unplanned`)
        expect(rejected.status).not.toBe(0)
        expect(rejected.stderr).toContain('operation denied')
        const accepted = command('push', '--', 'origin', `${plan.head}:refs/heads/${plan.branch}`)
        expect(accepted.status, accepted.stderr).toBe(0)
        expect(
          spawnSync('git', ['--git-dir', bare, 'rev-parse', `refs/heads/${plan.branch}`], {
            encoding: 'utf8',
          }).stdout.trim(),
        ).toBe(input.updates[0]?.localSha)
        expect(command('push', 'origin', `:refs/heads/${plan.branch}`).status).not.toBe(0)
      }),
    20000,
  )
  it(
    'preserves prior hook paths, double-checks mutations and restores only the local override',
    async () =>
      fixture(({ dir, root, store, git, command }) => {
        const original = join(dir, 'original-hooks')
        mkdirSync(original)
        const marker = join(dir, 'prior-ran')
        writeFileSync(
          join(original, 'pre-commit'),
          `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'ran')\n`,
        )
        chmodSync(join(original, 'pre-commit'), 0o755)
        git('config', 'core.hooksPath', original)
        const installed = gitGuards('install', root, core(), store.files.root)
        expect(installed.status).toBe('installed')
        expect(gitGuards('install', root, core(), store.files.root).status).toBe('already-correct')
        expect(
          command('commit', '--allow-empty', '-m', 'chore: chain existing policy').status,
        ).toBe(0)
        expect(readFileSync(marker, 'utf8')).toBe('ran')
        writeFileSync(
          join(original, 'pre-commit'),
          `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');fs.mkdirSync('.wholeloop/runtime',{recursive:true});fs.writeFileSync('.wholeloop/runtime/item','state');process.exit(cp.spawnSync('git',['add','.wholeloop/runtime'],{stdio:'inherit'}).status)\n`,
        )
        expect(
          command('commit', '--allow-empty', '-m', 'chore: reject prior mutation').status,
        ).not.toBe(0)
        expect(gitGuards('status', root, undefined, store.files.root).status).toBe('installed')
        const removed = gitGuards('uninstall', root, undefined, store.files.root)
        expect(removed.status).toBe('uninstalled')
        expect('retained' in removed && existsSync(removed.retained)).toBe(true)
        expect(git('config', '--local', '--get', 'core.hooksPath')).toBe(original)
        expect(gitGuards('uninstall', root, undefined, store.files.root).status).toBe(
          'already-absent',
        )
      }),
    15000,
  )
  it('restores effective global hooks without copying them into local configuration', async () =>
    fixture(({ root, dir, store, git, command }) => {
      const original = join(dir, 'global-hooks')
      mkdirSync(original)
      git('config', '--global', 'core.hooksPath', original)
      const result = gitGuards('install', root, core(), store.files.root)
      expect(result.status).toBe('installed')
      gitGuards('uninstall', root, undefined, store.files.root)
      expect(command('config', '--local', '--get', 'core.hooksPath').status).toBe(1)
      expect(git('config', '--get', 'core.hooksPath')).toBe(original)
    }))
  it('reports changed configuration and preserves a prepared installation for inspection', async () =>
    fixture(({ root, store, git }) => {
      gitGuards('install', root, core(), store.files.root)
      git('config', 'core.hooksPath', '/dev/null')
      expect(gitGuards('status', root, undefined, store.files.root).status).toBe(
        'configuration-changed',
      )
      expect(() => gitGuards('uninstall', root, undefined, store.files.root)).toThrow(
        'configuration changed',
      )
    }))
  it('refuses edited owned files or changed configuration without overwriting either', async () =>
    fixture(({ root, store, git }) => {
      const result = gitGuards('install', root, core(), store.files.root)
      const hook = join(result.hooks, 'pre-commit')
      writeFileSync(hook, 'personal edit\n')
      expect(gitGuards('status', root, undefined, store.files.root).status).toBe('changed')
      expect(() => gitGuards('uninstall', root, undefined, store.files.root)).toThrow('changed')
      expect(readFileSync(hook, 'utf8')).toBe('personal edit\n')
      git('config', 'core.hooksPath', '/dev/null')
      expect(() => gitGuards('install', root, core(), store.files.root)).toThrow()
    }))
  it('refuses relative and worktree-specific hook overrides explicitly', async () =>
    fixture(({ root, store, git }) => {
      git('config', 'core.hooksPath', 'relative-hooks')
      expect(() => gitGuards('install', root, core(), store.files.root)).toThrow('manual chaining')
      git('config', '--unset-all', 'core.hooksPath')
      git('config', 'extensions.worktreeConfig', 'true')
      git('config', '--worktree', 'core.hooksPath', '/dev/null')
      expect(() => gitGuards('install', root, core(), store.files.root)).toThrow(
        'Worktree-specific',
      )
    }))
  it(
    'returns bounded redacted CLI decisions, including malformed native input',
    async () =>
      fixture(({ dir, root, store }) => {
        const call = (args: string[], input?: string) =>
          spawnSync(process.execPath, [corePath, ...args, '--json'], {
            cwd: root,
            input,
            encoding: 'utf8',
            env: gitEnv(dir),
            timeout: 10000,
            maxBuffer: 65536,
          })
        for (const input of [
          'secret-token',
          JSON.stringify({ tool: 'bash', args: { command: 42, secret: 'private-value' } }),
          'x'.repeat(2097153),
        ]) {
          const result = call(
            ['guard', 'before-tool', '--stdin', '--store', store.files.root],
            input,
          )
          expect(result.status).toBe(2)
          expect(JSON.parse(result.stdout).decision).toBe('deny')
          expect(result.stdout).not.toMatch(/secret-token|private-value/)
        }
        expect(call(['guard', 'state-write', '--path', join(root, 'state')]).status).toBe(2)
        expect(call(['guard', 'git-commit', '--store', store.files.root]).status).toBe(0)
        expect(call(['guard', 'hooks', 'install', '--store', store.files.root]).status).toBe(0)
        expect(call(['guard', 'hooks', 'uninstall', '--store', store.files.root]).status).toBe(0)
      }),
    15000,
  )
  it('returns native deny when the copied core disappears without echoing payloads', async () =>
    fixture(({ root, dir }) => {
      const output = join(dir, 'missing-core')
      writeAdapter(output, generateAdapter('claude', bundledCanonical(), core(), '0.0.0'))
      rmSync(join(output, 'bin/wl.mjs'))
      const result = spawnSync(process.execPath, [join(output, 'hooks/run.mjs'), 'claude'], {
        cwd: root,
        input: JSON.stringify({
          cwd: root,
          tool_name: 'Read',
          tool_input: { file_path: 'private-file' },
        }),
        encoding: 'utf8',
        env: gitEnv(dir),
        timeout: 10000,
      })
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny')
      expect(result.stdout).not.toContain('private-file')
    }))
  it.each(['claude', 'copilot', 'opencode'])(
    'runs the generated %s transport with empty allow and native deny semantics',
    async (target) =>
      fixture(async ({ dir, root }) => {
        const output = join(dir, `artifact-${target}`)
        writeAdapter(output, generateAdapter(target, bundledCanonical(), core(), '0.0.0'))
        const payload = {
          cwd: root,
          tool_name: 'Write',
          tool_input: {
            file_path: join(root, '.wholeloop/runtime/event'),
            content: 'private-value',
          },
        }
        if (target === 'opencode') {
          writeFileSync(
            join(output, '.opencode/plugins/wholeloop.mjs'),
            readFileSync(join(output, '.opencode/plugins/wholeloop.js')),
          )
          const script = join(dir, 'plugin-test.mjs')
          writeFileSync(
            script,
            `const {Wholeloop}=await import(${JSON.stringify(new URL(`file://${output}/.opencode/plugins/wholeloop.mjs`).href)});const hooks=await Wholeloop({directory:${JSON.stringify(root)}});try{await hooks['tool.execute.before']({tool:'write'},{args:{filePath:'.wholeloop/runtime/event',content:'private-value'}});process.exit(9)}catch(error){if(!error.message.includes('runtime'))process.exit(8)};await hooks['tool.execute.before']({tool:'read'},{args:{filePath:'a.txt'}})\n`,
          )
          const result = spawnSync(process.execPath, [script], {
            cwd: root,
            encoding: 'utf8',
            env: gitEnv(dir),
          })
          expect(result.status, result.stderr).toBe(0)
        } else {
          const config = JSON.parse(
            readFileSync(
              join(
                output,
                target === 'claude' ? 'hooks/hooks.json' : 'com.github.copilot/hooks/hooks.json',
              ),
              'utf8',
            ),
          )
          const invoke = (input: unknown, hasRoot = true) => {
            const args =
              target === 'copilot'
                ? config.hooks.preToolUse[0].args
                : [join(output, 'hooks/run.mjs'), 'claude']
            return spawnSync(process.execPath, args, {
              cwd: root,
              input: JSON.stringify(input),
              encoding: 'utf8',
              env: { ...gitEnv(dir), ...(hasRoot ? { COPILOT_PLUGIN_ROOT: output } : {}) },
              timeout: 15000,
            })
          }
          const denied = invoke(payload)
          expect(denied.status).toBe(0)
          const body = JSON.parse(denied.stdout)
          expect(
            target === 'claude'
              ? body.hookSpecificOutput.permissionDecision
              : body.permissionDecision,
          ).toBe('deny')
          expect(denied.stdout).not.toContain('private-value')
          const allowed = invoke({
            cwd: root,
            tool_name: 'Read',
            tool_input: { file_path: 'a.txt' },
          })
          expect(allowed.status, allowed.stderr).toBe(0)
          expect(allowed.stdout).toBe('')
          if (target === 'copilot')
            expect(JSON.parse(invoke(payload, false).stdout).permissionDecision).toBe('deny')
        }
      }),
    15000,
  )
})
