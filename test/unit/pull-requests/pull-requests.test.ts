import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { loadProviders, resolveProvider } from '../../../src/providers/load.js'
import type { OperationCall, ProviderHost } from '../../../src/providers/operations.js'
import {
  CliCodehostHost,
  codehostRepository,
  executeCodehostCommand,
} from '../../../src/pull-requests/codehost.js'
import { pullRequestPlans } from '../../../src/pull-requests/contracts.js'
import { PullRequestWorkflow } from '../../../src/pull-requests/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const body =
  '# Change\n\n## Summary\nReturn 400 for empty requests.\n\n## Validation\nManually submitted an empty request.\n'
async function fixture(
  run: (context: {
    dir: string
    root: string
    git: (...args: string[]) => string
    engine: FlowEngine
    workflow: PullRequestWorkflow
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-pr-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
      },
    })
    if (result.status !== 0) throw new Error(`Fixture Git failed: ${result.stderr}`)
    return result.stdout
  }
  try {
    git('init', '-b', 'main')
    mkdirSync(join(root, '.github'))
    mkdirSync(join(root, '.wholeloop'))
    writeFileSync(
      join(root, '.github/pull_request_template.md'),
      '# Change\n\n## Summary\n\n## Validation\n',
    )
    writeFileSync(
      join(root, '.wholeloop/config.yml'),
      'version: 1\nproviders:\n  codehost: github\n',
    )
    writeFileSync(join(root, 'a.txt'), 'base\n')
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'feat: seed draft fixture',
      '-m',
      'Pin a real repository template and base for publication checks.',
    )
    git('switch', '-c', 'feature/empty')
    writeFileSync(join(root, 'a.txt'), 'return 400\n')
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'fix: handle empty requests',
      '-m',
      'Provide a distinct commit for synthetic code-host publication.',
    )
    git('remote', 'add', 'origin', 'git@github.com:example/product.git')
    const engine = new FlowEngine(
      new StateStore(join(dir, 'state/wholeloop')),
      root,
      join(dir, 'config/wholeloop/config.yml'),
      join(dir, 'home'),
    )
    await run({ dir, root, git, engine, workflow: new PullRequestWorkflow(engine) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function prepared(workflow: PullRequestWorkflow) {
  const result = workflow.prepare({
    owner: 'Owner',
    title: 'fix: reject empty requests',
    body,
    base: 'main',
  })
  if (!('draft' in result)) throw new Error('Expected publication plan')
  return result
}
function observed(plan: ReturnType<typeof prepared>['draft']) {
  return {
    url: `${plan.repository}/pull/12`,
    repository: plan.repository,
    head: plan.branch,
    base: plan.base,
    sha: plan.head,
    draft: true,
    merged: false,
    state: 'open' as const,
  }
}
function hostFor(plan: ReturnType<typeof prepared>['draft'], calls: OperationCall[]): ProviderHost {
  return {
    invoke: async (call) => {
      calls.push(call)
      const pr = observed(plan)
      return {
        status: 'succeeded',
        ref: pr.url,
        complete: true,
        revision: pr.sha,
        body: JSON.stringify(pr),
      }
    },
  }
}

describe('exact-plan human testing and draft publication', () => {
  it('asks missing facts before mutation and loads the real repository template', async () =>
    fixture(({ engine, workflow }) => {
      const result = workflow.prepare({})
      expect(result.status).toBe('question')
      expect(result.questions.map((question) => question.id)).toEqual([
        'owner',
        'base',
        'title',
        'body',
      ])
      expect(result.convention.content).toContain('## Validation')
      expect(engine.store.events()).toEqual([])
      expect(() =>
        workflow.prepare({
          owner: 'Owner',
          title: 'Fix',
          base: 'main',
          body: '## Summary\nOnly summary\n',
        }),
      ).toThrow('required repository PR template section')
      expect(engine.store.events()).toEqual([])
    }))

  it('never calls a host before actual exact-plan testing, including a bare decision answer', async () =>
    fixture(async ({ workflow, engine }) => {
      const plan = prepared(workflow)
      const calls: OperationCall[] = []
      const host = hostFor(plan.draft, calls)
      await expect(workflow.publish(plan.subject, host)).rejects.toThrow('person must test')
      engine.answer('decision.test-it', 'approved', {
        scope: 'run',
        subject: plan.subject,
        by: 'Owner',
      })
      await expect(workflow.publish(plan.subject, host)).rejects.toThrow('person must test')
      expect(calls).toEqual([])
      expect(() => workflow.tested(plan.subject, 'Owner', '')).toThrow('what they tested')
    }))

  it('invalidates approval on changed draft text or code and refuses attribution and dirty/default branches', async () =>
    fixture(async ({ workflow, root, git }) => {
      const first = prepared(workflow)
      workflow.tested(first.subject, 'Owner', 'Submitted an empty request; observed 400')
      const second = workflow.prepare({
        subject: first.subject,
        base: 'main',
        title: 'fix: reject empty requests',
        body: body.replace('400', 'HTTP 400'),
      })
      if (!('draft' in second)) throw new Error('Expected replacement plan')
      expect(second.plan).not.toBe(first.plan)
      await expect(workflow.publish(first.subject, hostFor(second.draft, []))).rejects.toThrow(
        'person must test',
      )
      writeFileSync(join(root, 'a.txt'), 'changed after testing\n')
      expect(() => workflow.tested(first.subject, 'Owner', 'Tested')).toThrow('stale')
      expect(() => workflow.prepare({ subject: first.subject, base: 'main', body })).toThrow(
        'Commit authorized changes',
      )
      git('restore', 'a.txt')
      expect(() =>
        workflow.prepare({
          subject: first.subject,
          base: 'main',
          body: `${body}\nCo-Authored-By: AI Fixture\n`,
        }),
      ).toThrow('attribution')
      git('switch', 'main')
      expect(() => workflow.prepare({ owner: 'Owner', title: 'Fix', body, base: 'main' })).toThrow(
        'target branch',
      )
    }))

  it('publishes one explicit draft, records links and receipt, and reuses the same remote result', async () =>
    fixture(async ({ engine, workflow, root }) => {
      const plan = prepared(workflow)
      const index = readFileSync(join(root, '.git/index'))
      workflow.tested(plan.subject, 'Owner', 'Observed 400 for empty input')
      const calls: OperationCall[] = []
      const result = await workflow.publish(plan.subject, hostFor(plan.draft, calls))
      expect(result.status).toBe('published')
      expect(calls[0]?.args.draft).toBe(true)
      expect(calls[0]?.args.approved).toBe(true)
      expect(calls[0]?.args.body).toContain('## Summary')
      expect(calls[0]?.args.body).toContain('not run by this standalone')
      expect(engine.store.get(plan.subject).links).toContain(observed(plan.draft).url)
      expect((await workflow.publish(plan.subject, hostFor(plan.draft, calls))).cached).toBe(true)
      expect(calls).toHaveLength(1)
      expect(readFileSync(join(root, '.git/index'))).toEqual(index)
      const path = `items/${plan.subject}/pull-requests/${plan.plan}.json`
      const content = engine.store.files.read(path)
      engine.store.rebuild()
      expect(engine.store.files.read(path)).toBe(content)
    }))

  it('keeps interrupted writes ambiguous, serializes callers and reconciles through a read', async () =>
    fixture(async ({ workflow, engine }) => {
      const plan = prepared(workflow)
      workflow.tested(plan.subject, 'Owner', 'Tested empty input')
      let writes = 0
      const host: ProviderHost = {
        invoke: async () => {
          writes++
          throw new Error('Synthetic lost response')
        },
      }
      const results = await Promise.allSettled([
        workflow.publish(plan.subject, host),
        workflow.publish(plan.subject, host),
      ])
      expect(results.every((result) => result.status === 'rejected')).toBe(true)
      expect(writes).toBe(1)
      expect(pullRequestPlans(engine.store.events())[0]?.requested).toBeTruthy()
      await expect(workflow.publish(plan.subject, host)).rejects.toThrow('ambiguous')
      const calls: OperationCall[] = []
      expect(
        (
          await workflow.reconcile(
            plan.subject,
            observed(plan.draft).url,
            hostFor(plan.draft, calls),
          )
        ).status,
      ).toBe('published')
      expect(calls.map((call) => call.operation)).toEqual(['codehost.read-pr'])
    }))

  it.each(['draft', 'sha', 'repository'] as const)(
    'rejects a provider that returns the wrong %s',
    async (field) =>
      fixture(async ({ workflow, engine }) => {
        const plan = prepared(workflow)
        workflow.tested(plan.subject, 'Owner', 'Observed the expected empty response')
        const wrong = {
          ...observed(plan.draft),
          [field]:
            field === 'draft'
              ? false
              : field === 'sha'
                ? 'a'.repeat(40)
                : 'https://github.com/other/product',
        }
        await expect(
          workflow.publish(plan.subject, {
            invoke: async () => ({
              status: 'succeeded',
              ref: wrong.url,
              complete: true,
              body: JSON.stringify(wrong),
            }),
          }),
        ).rejects.toThrow('matching open draft')
        expect(pullRequestPlans(engine.store.events())[0]?.pr).toBeUndefined()
      }),
  )

  it('does not silently treat a planned slice as an ungated standalone branch', async () =>
    fixture(({ workflow, engine, root }) => {
      const subject = engine.store.create({
        kind: 'slice',
        title: 'Fix',
        owner: 'Owner',
        body: '',
        repository: root,
      }).id
      engine.store.transaction((_events, append) =>
        append(subject, {
          type: 'build.agreed',
          data: {
            criteria: [
              {
                id: 'empty',
                text: 'Return 400 for empty input',
                test: 'Submit an empty request and assert status 400',
              },
            ],
            by: 'Owner',
            source: { kind: 'sentence', ref: 'Handle empty input' },
          },
        }),
      )
      expect(() => workflow.prepare({ subject, base: 'main', body })).toThrow('builder plan')
    }))
})

describe('gh and glab code-host boundaries', () => {
  it.each(['github', 'gitlab'] as const)(
    '%s pushes only its pinned SHA and sends draft JSON through stdin',
    async (provider) =>
      fixture(async ({ workflow, root, git }) => {
        git('remote', 'set-url', 'origin', `https://${provider}.com/example/product.git`)
        const plan = workflow.prepare({
          owner: 'Owner',
          title: 'fix: reject empty requests',
          body,
          base: 'main',
          provider,
        })
        if (!('draft' in plan)) throw new Error('Expected publication plan')
        workflow.tested(plan.subject, 'Owner', 'Tested the committed request handler')
        const commands: { binary: string; args: readonly string[]; input?: string }[] = []
        const host = new CliCodehostHost(root, async (binary, args, _cwd, input) => {
          commands.push({ binary, args, ...(input ? { input } : {}) })
          if (binary === 'git') return ''
          const request = JSON.parse(input ?? '{}')
          expect(args).toContain('--input')
          expect(request.body ?? request.description).toContain('## Validation')
          expect(args.join(' ')).not.toContain('Return 400')
          if (provider === 'github') {
            expect(request.draft).toBe(true)
            return JSON.stringify({
              html_url: `${plan.draft.repository}/pull/12`,
              head: { ref: plan.draft.branch, sha: plan.draft.head },
              base: { ref: 'main' },
              draft: true,
              merged: false,
              state: 'open',
            })
          }
          expect(request.title).toMatch(/^Draft: /)
          return JSON.stringify({
            web_url: `${plan.draft.repository}/-/merge_requests/12`,
            source_branch: plan.draft.branch,
            target_branch: 'main',
            sha: plan.draft.head,
            draft: true,
            state: 'opened',
          })
        })
        expect((await workflow.publish(plan.subject, host)).status).toBe('published')
        expect(commands[0]?.args).toEqual([
          'push',
          '--',
          'origin',
          `${plan.draft.head}:refs/heads/${plan.draft.branch}`,
        ])
        expect(commands[1]?.binary).toBe(provider === 'github' ? 'gh' : 'glab')
        const registry = loadProviders({ root, user: join(root, 'not-a-user-config') })
        expect(resolveProvider(registry, 'codehost.comment-pr', provider).manifest.id).toBe(
          provider,
        )
      }),
  )

  it('rejects inline credentials, unrelated PR URLs and unsupported operations without invoking a process', async () =>
    fixture(async ({ root, git }) => {
      git('remote', 'set-url', 'origin', 'https://fixture-user@github.com/example/product.git')
      expect(() => codehostRepository(root, 'origin')).toThrow('credential-free')
      git('remote', 'set-url', 'origin', 'git@github.com:example/product.git')
      let calls = 0
      const host = new CliCodehostHost(root, async () => {
        calls++
        return '{}'
      })
      await expect(
        host.invoke({
          provider: 'github',
          tool: 'gh.api',
          operation: 'codehost.read-pr',
          args: { ref: 'https://github.com/other/product/pull/12' },
          guidance: '',
        }),
      ).rejects.toThrow('belong to this remote')
      await expect(
        host.invoke({
          provider: 'github',
          tool: 'gh.api',
          operation: 'codehost.merge-pr',
          args: {},
          guidance: '',
        }),
      ).rejects.toThrow('Unsupported')
      expect(calls).toBe(0)
    }))

  it('executes a real argv process with stdin and redacts failed process output', async () =>
    fixture(async ({ root }) => {
      const output = await executeCodehostCommand(
        process.execPath,
        ['-e', "process.stdin.on('data', data => process.stdout.write(data))"],
        root,
        'synthetic API JSON',
      )
      expect(output).toBe('synthetic API JSON')
      await expect(
        executeCodehostCommand(
          process.execPath,
          ['-e', "console.error('private fixture detail');process.exit(3)"],
          root,
        ),
      ).rejects.toThrow('Code-host command failed')
    }))

  it('pushes the exact object to a temporary local bare repository without changing the index', async () =>
    fixture(async ({ dir, root, git }) => {
      const bare = join(dir, 'local bare remote.git')
      const initialized = spawnSync('git', ['init', '--bare', bare], { encoding: 'utf8' })
      expect(initialized.status).toBe(0)
      const index = readFileSync(join(root, '.git/index'))
      const head = git('rev-parse', 'HEAD').trim()
      await executeCodehostCommand(
        'git',
        ['-c', 'core.hooksPath=/dev/null', 'push', '--', bare, `${head}:refs/heads/feature/empty`],
        root,
      )
      expect(
        spawnSync('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/feature/empty'], {
          encoding: 'utf8',
        }).stdout.trim(),
      ).toBe(head)
      expect(readFileSync(join(root, '.git/index'))).toEqual(index)
    }))

  it('reconciles an explicitly requested comment by its round marker before posting again', async () =>
    fixture(async ({ root }) => {
      let posts = 0
      const comments: Record<string, unknown>[] = []
      const host = new CliCodehostHost(root, async (_binary, args, _cwd, input) => {
        if (args.includes('GET')) return JSON.stringify(comments)
        posts++
        const body = JSON.parse(input ?? '{}').body
        expect(body).toContain('<!-- review-round: gate-')
        comments.push({
          body,
          html_url: 'https://github.com/example/product/pull/12#issuecomment-1',
        })
        return JSON.stringify(comments[0])
      })
      const call: OperationCall = {
        provider: 'github',
        operation: 'codehost.comment-pr',
        tool: 'gh.api',
        guidance: '',
        args: {
          ref: 'https://github.com/example/product/pull/12',
          body: 'Synthetic review finding',
          idempotencyKey: `gate-${'a'.repeat(16)}/1/${'b'.repeat(64)}`,
        },
      }
      const first = await host.invoke(call)
      expect(await host.invoke(call)).toEqual(first)
      expect(posts).toBe(1)
    }))

  it('supports a GitLab template and the compiled CLI without any remote write before testing', async () =>
    fixture(({ dir, root, git }) => {
      rmSync(join(root, '.github/pull_request_template.md'))
      mkdirSync(join(root, '.gitlab/merge_request_templates'), { recursive: true })
      writeFileSync(
        join(root, '.gitlab/merge_request_templates/Default.md'),
        '## Summary\n\n## Validation\n',
      )
      git('add', '.')
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-m',
        'docs: seed gitlab template',
        '-m',
        'Verify GitLab discovery independently of the provider process.',
      )
      const file = join(dir, 'body.md')
      writeFileSync(file, body)
      const call = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: join(dir, 'home'),
            XDG_STATE_HOME: join(dir, 'cli-state'),
            XDG_CONFIG_HOME: join(dir, 'cli-config'),
          },
        })
        return { status: result.status, output: JSON.parse(result.stdout) }
      }
      const plan = call(
        'pr',
        'prepare',
        '--owner',
        'Owner',
        '--title',
        'fix: handle empty input',
        '--base',
        'main',
        '--body-file',
        file,
      )
      expect(plan.status).toBe(0)
      expect(plan.output.convention.ref).toBe('.gitlab/merge_request_templates/Default.md')
      const rejected = call('pr', 'open', '--for', plan.output.subject)
      expect(rejected.status).toBe(3)
      expect(rejected.output.message).toContain('person must test')
      expect(
        call(
          'pr',
          'tested',
          '--for',
          plan.output.subject,
          '--by',
          'Owner',
          '--note',
          'Observed the expected response',
        ).status,
      ).toBe(0)
    }))
})
