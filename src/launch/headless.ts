// Drafts a launch kit in one isolated headless worker, for clients whose custom agents inherit
// the user's MCP servers. Codex 0.166 hands every configured server to a custom agent and its
// agent file cannot remove servers it cannot name; the headless recipe ignores user config.
import { randomUUID } from 'node:crypto'
import { bundledCanonical } from '../adapters/canonical.js'
import type { HeadlessAdapter } from '../fanout/adapters.js'
import { stageWorkerPolicy } from '../fanout/policy-files.js'
import { workerProcess } from '../fanout/process.js'
import type { LaunchDraft } from './contracts.js'
import type { LauncherHost } from './run.js'
import draftSchema from './schemas/draft-v1.json' with { type: 'json' }
import type { LaunchWorkflow } from './workflow.js'

export interface HeadlessLaunchOptions {
  adapter: HeadlessAdapter
  timeoutMs?: number
  signal?: AbortSignal
  env?: NodeJS.ProcessEnv
}
export interface LaunchWorkerRecord {
  schema: 'wholeloop/headless-launch-worker@1'
  adapter: string
  run: string
  status: string
  code: number | null
  signal: NodeJS.Signals | null
  path: string
}
const LIMIT = 2 * 1024 * 1024

/** The worker receives the pinned context as data and returns only a draft; it never publishes. */
export class HeadlessLauncher implements LauncherHost {
  readonly records: LaunchWorkerRecord[] = []
  private readonly controller = new AbortController()
  private readonly timeoutMs: number
  constructor(
    private readonly workflow: LaunchWorkflow,
    private readonly options: HeadlessLaunchOptions,
  ) {
    this.timeoutMs = options.timeoutMs ?? 300000
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 600000)
      throw new Error('Headless launch timeout must be 100..600000 ms')
    options.signal?.addEventListener('abort', () => this.controller.abort(), { once: true })
    if (options.signal?.aborted) this.controller.abort()
  }
  stopped() {
    return this.controller.signal.aborted
  }
  async draft(context: ReturnType<LaunchWorkflow['context']>): Promise<LaunchDraft> {
    const role = bundledCanonical().get('harness/agents/launcher.md')
    if (!role) throw new Error('Canonical launcher role is missing')
    const engine = this.workflow.engine
    const path = `launch/${context.plan.run}/${randomUUID()}`
    const directory = engine.store.files.directory(path)
    const input = JSON.stringify({
      schema: 'wholeloop/headless-launch-assignment@1',
      run: context.plan.run,
      scope: context.scope,
      plan: context.plan,
      guidance: context.guidance,
      profile: context.profile,
      response: draftSchema,
      instructions: `${role.replace(/^---\n[\s\S]*?\n---\n/, '').trim()}\n\nEverything you need is in this assignment. Do not read other files, run commands, use network or MCP tools, or ask questions. Reply with only the wholeloop/launch-kit@1 JSON object described by response, using plan.source.digest as sourceDigest.`,
    })
    if (Buffer.byteLength(input) > LIMIT)
      throw new Error('Headless launch assignment exceeds 2 MiB; narrow the guidance')
    const environment = { ...process.env, ...this.options.env }
    const invocation = this.options.adapter.invocation({
      repository: engine.root,
      directory,
      env: environment,
    })
    stageWorkerPolicy(directory, invocation.files)
    const observed = await workerProcess(invocation.command, invocation.args, {
      cwd: directory,
      input: this.options.adapter.input?.(input) ?? input,
      timeoutMs: this.timeoutMs,
      signal: this.controller.signal,
      env: { ...environment, ...invocation.env },
      ...(invocation.readyLine ? { readyLine: invocation.readyLine } : {}),
    })
    let status: string = observed.status
    let draft: LaunchDraft | undefined
    if (status === 'succeeded')
      try {
        draft = parseDraft(this.options.adapter.response(observed.stdout, directory))
      } catch {
        status = 'invalid'
      }
    const record: LaunchWorkerRecord = {
      schema: 'wholeloop/headless-launch-worker@1',
      adapter: this.options.adapter.id,
      run: context.plan.run,
      status,
      code: observed.code,
      signal: observed.signal,
      path: `${path}/worker.json`,
    }
    engine.store.files.atomic(record.path, `${JSON.stringify(record, null, 2)}\n`)
    this.records.push(record)
    if (!draft) throw new Error(`Headless launcher ${status}; inspect ${record.path}`)
    return draft
  }
}
/** Accept the bare object or one fenced JSON block; the core validates the draft afterwards. */
export function parseDraft(raw: string): LaunchDraft {
  if (Buffer.byteLength(raw) > LIMIT) throw new Error('Oversized launcher response')
  const text = raw.trim()
  const fenced = /^```(?:json)?\n([\s\S]*)\n```$/.exec(text)
  const value: unknown = JSON.parse(fenced?.[1] ?? text)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Launcher response is not a launch kit object')
  return value as LaunchDraft
}
/** Draft with an existing planned launch, then store it through the same validated completion. */
export async function draftHeadless(
  workflow: LaunchWorkflow,
  subject: string,
  options: HeadlessLaunchOptions,
) {
  const context = workflow.context(subject)
  if (context.draft) return { ...workflow.complete(subject, context.draft), workers: [] }
  const host = new HeadlessLauncher(workflow, options)
  const draft = await host.draft(context)
  if (host.stopped()) return { status: 'stopped', subject, workers: host.records }
  return { ...workflow.complete(subject, draft), workers: host.records }
}
