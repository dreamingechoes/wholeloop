// Runs Git for assembly with repository helpers disabled, refusing rather than executing them.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { operationGroup } from '../environment/operations.js'
import { operationWrapper } from '../fanout/operation-wrapper.js'
import { workerProcess } from '../fanout/process.js'
import type { StoreFiles } from '../state/files.js'
import { git } from '../worktrees/git.js'
import { IntegrationError } from './contracts.js'
import outcomeSchema from './schemas/git-process-outcome-v1.json' with { type: 'json' }

const WRAPPER = operationWrapper('wholeloop/integration-operation-outcome@1')
export interface AssemblyGitControl {
  deadline: string
  signal: AbortSignal
  current(): boolean
  started?(runtime: { operation: string; pid: number }): void
}
export function assemblyGitEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: home,
    LANG: 'C',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  }
}
/** Repository helpers would execute on the controller during checkout/merge; refuse rather than approximate containment. */
export function assertAssemblyGit(root: string) {
  assertAssemblyGitConfiguration(
    git(root, ['config', '--local', '--no-includes', '--null', '--list']),
  )
}
/** Bounded read hosts use the same guard with their own sanitized Git invocation. */
export function assertAssemblyGitConfiguration(configuration: string) {
  const entries = configuration.split('\0').filter(Boolean)
  for (const entry of entries) {
    const key = entry.split('\n')[0] ?? ''
    if (
      /^(?:include|filter\.|merge\.|diff\.|gpg\.|credential\.|core\.(?:fsmonitor|sshcommand|hookspath)|extensions\.(?:worktreeconfig|partialclone)|remote\..*\.(?:uploadpack|receivepack|promisor))/.test(
        key.toLowerCase(),
      )
    )
      throw new IntegrationError('controller-git-helper-unavailable')
  }
}
export function assemblyGitArguments(hooks: string, owner: string, args: string[]) {
  return [
    '-c',
    `core.hooksPath=${hooks}`,
    '-c',
    'core.fsmonitor=false',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'merge.gpgsign=false',
    '-c',
    'submodule.recurse=false',
    '-c',
    `user.name=${owner}`,
    '-c',
    'user.email=integration@localhost',
    ...args,
  ]
}
export class AssemblyGitProcess {
  constructor(
    readonly files: StoreFiles,
    readonly path: string,
  ) {}
  private read(name: string): Record<string, unknown> | undefined {
    const ref = `${this.path}/${name}.json`
    return existsSync(this.files.path(ref))
      ? (JSON.parse(readSourceFile(this.files.root, ref, 65536)) as Record<string, unknown>)
      : undefined
  }
  /** A fresh controller writes only the original private nonce; it never signals a remembered PID. */
  requestCancellation(): boolean {
    const intent = this.read('intent')
    if (!intent) return false
    if (
      typeof intent.nonce !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(intent.nonce) ||
      typeof intent.operation !== 'string' ||
      !/^assembly-operation-[a-f0-9-]{36}$/.test(intent.operation)
    )
      throw new IntegrationError('assembly-owner-unavailable')
    this.files.atomic(`${this.path}/cancel.json`, JSON.stringify({ nonce: intent.nonce }))
    return true
  }
  async invoke(
    cwd: string,
    args: string[],
    deadline: string,
    signal: AbortSignal,
    current: () => void,
    control?: AssemblyGitControl,
  ) {
    if (!control) return this.dispatch(cwd, args, deadline, signal, current)
    const until = Math.min(Date.parse(deadline), Date.parse(control.deadline))
    if (!Number.isFinite(until) || until <= Date.now() || !control.current())
      throw new IntegrationError('assembly-controller-fenced')
    const abort = new AbortController(),
      cancel = () => abort.abort(),
      check = () => {
        current()
        if (!control.current()) throw new IntegrationError('assembly-controller-fenced')
      }
    signal.addEventListener('abort', cancel, { once: true })
    control.signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted || control.signal.aborted) abort.abort()
    try {
      return await this.dispatch(
        cwd,
        args,
        new Date(until).toISOString(),
        abort.signal,
        check,
        control.started,
      )
    } finally {
      signal.removeEventListener('abort', cancel)
      control.signal.removeEventListener('abort', cancel)
    }
  }
  private async dispatch(
    cwd: string,
    args: string[],
    deadline: string,
    signal: AbortSignal,
    current: () => void,
    started?: AssemblyGitControl['started'],
  ) {
    if (this.read('intent')) throw new IntegrationError('assembly-operation-already-dispatched')
    const nonce = randomUUID(),
      operation = `assembly-operation-${randomUUID()}`
    const timeoutMs = Math.min(30000, Date.parse(deadline) - Date.now())
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || signal.aborted)
      throw new IntegrationError('assembly-operation-deadline')
    this.files.directory(this.path)
    const cancel = this.files.path(`${this.path}/cancel.json`),
      outcome = this.files.path(`${this.path}/outcome.json`),
      home = this.files.path(`${this.path}/home`)
    mkdirSync(home, { recursive: true, mode: 0o700 })
    this.files.atomic(
      `${this.path}/intent.json`,
      JSON.stringify({ operation, nonce, cwd, command: contractDigest(args), deadline }),
    )
    const cancelLive = () =>
      this.files.atomic(`${this.path}/cancel.json`, JSON.stringify({ nonce }))
    signal.addEventListener('abort', cancelLive, { once: true })
    const watch = setInterval(() => {
      try {
        current()
      } catch {
        cancelLive()
      }
    }, 50)
    try {
      await workerProcess(process.execPath, ['--input-type=module', '-e', WRAPPER], {
        cwd,
        env: assemblyGitEnvironment(home),
        input: JSON.stringify({
          operation,
          nonce,
          cancel,
          outcome,
          command: 'git',
          args,
          input: '',
          timeoutMs,
        }),
        timeoutMs: timeoutMs + 1000,
        signal,
        started: (pid) => {
          current()
          this.files.atomic(`${this.path}/started.json`, JSON.stringify({ pid, nonce, operation }))
          started?.({ pid, operation })
          if (started) current()
        },
      })
    } finally {
      clearInterval(watch)
      signal.removeEventListener('abort', cancelLive)
    }
  }
  observe(args: string[], cwd: string) {
    const intent = this.read('intent'),
      started = this.read('started'),
      outcome = this.read('outcome')
    if (
      !intent ||
      intent.command !== contractDigest(args) ||
      intent.cwd !== cwd ||
      !started ||
      started.nonce !== intent.nonce ||
      started.operation !== intent.operation ||
      !Number.isSafeInteger(started.pid) ||
      Number(started.pid) < 1
    )
      return undefined
    try {
      acceptanceShape(outcome, outcomeSchema)
    } catch {
      return undefined
    }
    const group = operationGroup(Number(started.pid))
    if (
      group.status !== 'absent' ||
      !outcome ||
      outcome.schema !== 'wholeloop/integration-operation-outcome@1' ||
      outcome.nonce !== intent.nonce ||
      outcome.operation !== intent.operation ||
      outcome.pid !== started.pid ||
      outcome.reason !== 'finished' ||
      !Number.isInteger(outcome.code) ||
      outcome.signal !== undefined ||
      Object.keys(outcome).sort().join(',') !== 'at,code,nonce,operation,pid,reason,schema'
    )
      return undefined
    return {
      code: Number(outcome.code),
      evidence: contractDigest({ intent, started, outcome, group }),
      invocationState: 'stopped' as const,
    }
  }
}
