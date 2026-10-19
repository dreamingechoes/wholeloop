import { spawn } from 'node:child_process'
import { isObject } from '../config/schema.js'
import type { OperationCall, OperationResult, ProviderHost } from '../providers/operations.js'
import { git } from '../worktrees/git.js'
import type { PullRequest } from './contracts.js'

export function codehostRepository(root: string, remote: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote)) throw new Error('Use one named Git remote')
  const urls = git(root, ['remote', 'get-url', '--push', '--all', remote]).trim().split('\n')
  if (urls.length !== 1) throw new Error('Publication requires exactly one push destination')
  const raw = urls[0] ?? ''
  const scp = /^git@([a-zA-Z0-9.-]+):([a-zA-Z0-9._/-]+)$/.exec(raw)
  const url = new URL(scp ? `https://${scp[1]}/${scp[2]}` : raw)
  if (
    !['https:', 'ssh:'].includes(url.protocol) ||
    (url.username && !(url.protocol === 'ssh:' && url.username === 'git')) ||
    url.password ||
    url.search ||
    url.hash ||
    url.port
  )
    throw new Error('Use a credential-free HTTPS or standard SSH code-host remote')
  const path = url.pathname
    .replace(/^\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
  if (
    !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(path) ||
    path.split('/').some((segment) => ['.', '..'].includes(segment))
  )
    throw new Error('Remote must name an owner/group and repository')
  return { host: url.hostname, path, url: `https://${url.hostname}/${path}` }
}
export type CommandExecutor = (
  binary: string,
  args: readonly string[],
  cwd: string,
  input?: string,
) => Promise<string>
/** No shell, credential arguments or durable raw logs. CLI credential stores remain authoritative. */
export const executeCodehostCommand: CommandExecutor = (binary, args, cwd, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const output: Buffer[] = []
    let bytes = 0
    let failed = false
    const stop = () => {
      failed = true
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        /* The command may already have exited; its close event is authoritative. */
      }
    }
    const timeout = setTimeout(stop, 60000)
    const collect = (chunk: Buffer, stdout: boolean) => {
      bytes += chunk.length
      if (bytes > 1024 * 1024) {
        stop()
      } else if (stdout) output.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => collect(chunk, true))
    child.stderr.on('data', (chunk: Buffer) => collect(chunk, false))
    child.stdin.on('error', () => {
      failed = true
    })
    child.on('error', () => {
      failed = true
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (failed || code !== 0)
        reject(new Error('Code-host command failed; reconcile remote state before retrying'))
      else resolve(Buffer.concat(output).toString('utf8'))
    })
    child.stdin.end(input)
  })

export function parsePullRequest(value: unknown): PullRequest {
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) =>
        !['url', 'repository', 'head', 'base', 'sha', 'draft', 'merged', 'state'].includes(key),
    ) ||
    !['url', 'repository', 'head', 'base', 'sha'].every(
      (key) => typeof value[key] === 'string' && !!value[key],
    ) ||
    typeof value.draft !== 'boolean' ||
    typeof value.merged !== 'boolean' ||
    !['open', 'closed', 'merged'].includes(String(value.state)) ||
    !/^[a-f0-9]{40,64}$/.test(String(value.sha))
  )
    throw new Error('Incomplete normalized PR observation')
  for (const field of ['url', 'repository']) {
    const url = new URL(String(value[field]))
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Invalid code-host reference')
  }
  return value as unknown as PullRequest
}

export class CliCodehostHost implements ProviderHost {
  constructor(
    readonly root: string,
    readonly execute: CommandExecutor = executeCodehostCommand,
  ) {}
  async invoke(call: OperationCall): Promise<OperationResult> {
    if (
      !['github', 'gitlab'].includes(call.provider) ||
      ![
        'codehost.open-draft-pr',
        'codehost.read-pr',
        'codehost.pr-status',
        'codehost.comment-pr',
      ].includes(call.operation)
    )
      throw new Error('Unsupported built-in code-host operation')
    const remote = typeof call.args.remote === 'string' ? call.args.remote : 'origin'
    const repo = codehostRepository(this.root, remote)
    const github = call.provider === 'github'
    const binary = github ? 'gh' : 'glab'
    if (call.tool !== `${binary}.api`)
      throw new Error('Code-host mapping must use the supported CLI API')
    const api = async (endpoint: string, method = 'GET', body?: Record<string, unknown>) => {
      const output = await this.execute(
        binary,
        [
          'api',
          '--hostname',
          repo.host,
          '--method',
          method,
          endpoint,
          ...(body ? ['--input', '-'] : []),
        ],
        this.root,
        body ? JSON.stringify(body) : undefined,
      )
      try {
        return JSON.parse(output) as unknown
      } catch {
        throw new Error('Code-host response is not complete JSON; contents omitted')
      }
    }
    const endpoint = github
      ? `repos/${repo.path}/pulls`
      : `projects/${encodeURIComponent(repo.path)}/merge_requests`
    const ref = typeof call.args.ref === 'string' ? call.args.ref : ''
    const prefix = `${repo.url}/${github ? 'pull/' : '-/merge_requests/'}`
    const number = ref.startsWith(prefix) ? ref.slice(prefix.length) : ''
    if (call.operation !== 'codehost.open-draft-pr' && !/^[1-9][0-9]*$/.test(number))
      throw new Error('PR reference must belong to this remote repository')
    if (call.operation === 'codehost.comment-pr') {
      if (typeof call.args.body !== 'string' || !call.args.body.trim())
        throw new Error('Comment body is required')
      const path = github
        ? `repos/${repo.path}/issues/${number}/comments`
        : `${endpoint}/${number}/notes`
      const key = call.args.idempotencyKey
      if (typeof key !== 'string' || !/^gate-[a-f0-9]{16}\/(?:[1-9]|10)\/[a-f0-9]{64}$/.test(key))
        throw new Error('A review comment requires its stable round key')
      const marker = `<!-- review-round: ${key} -->`
      const reference = (value: Record<string, unknown>) =>
        github ? String(value.html_url) : `${ref}#note_${String(value.id)}`
      // Reconcile successful prior writes before posting; concurrent writers still require host coordination.
      for (let page = 1; page <= 10; page++) {
        const comments = await api(`${path}?per_page=100&page=${page}`)
        if (!Array.isArray(comments))
          throw new Error('Incomplete comment listing; no write performed')
        const existing = comments.find(
          (entry) =>
            isObject(entry) && typeof entry.body === 'string' && entry.body.includes(marker),
        )
        if (isObject(existing)) return { status: 'succeeded', ref: reference(existing) }
        if (comments.length < 100) break
        if (page === 10)
          throw new Error('Comment reconciliation exceeds 1000 entries; inspect manually')
      }
      const value = await api(path, 'POST', { body: `${call.args.body}\n${marker}` })
      if (!isObject(value) || typeof (value.html_url ?? value.id) === 'undefined')
        throw new Error('Incomplete comment response; reconcile before retrying')
      return {
        status: 'succeeded',
        ref: github ? String(value.html_url) : `${ref}#note_${String(value.id)}`,
      }
    }
    let value: unknown
    if (call.operation === 'codehost.open-draft-pr') {
      const { branch, base, head, title, body, repository, snapshot } = call.args
      if (
        ![branch, base, head, title, body, snapshot].every(
          (entry) => typeof entry === 'string' && !!entry,
        ) ||
        repository !== repo.url ||
        !/^[a-f0-9]{40,64}$/.test(String(head)) ||
        call.args.draft !== true ||
        call.args.approved !== true
      )
        throw new Error('Publication requires its explicit approved draft plan')
      if (
        git(this.root, ['rev-parse', 'HEAD']).trim() !== head ||
        git(this.root, ['branch', '--show-current']).trim() !== branch ||
        git(this.root, ['status', '--porcelain', '-z'])
      )
        throw new Error('Publication branch changed or is not clean')
      // Pin the object, not a moving branch ref; never force, fork or auto-merge.
      await this.execute('git', ['push', '--', remote, `${head}:refs/heads/${branch}`], this.root)
      value = await api(
        endpoint,
        'POST',
        github
          ? { head: branch, base, title, body, draft: true, maintainer_can_modify: false }
          : {
              source_branch: branch,
              target_branch: base,
              title: `Draft: ${String(title).replace(/^Draft:\s*/i, '')}`,
              description: body,
              remove_source_branch: false,
            },
      )
    } else value = await api(`${endpoint}/${number}`)
    if (!isObject(value)) throw new Error('Incomplete PR response')
    const h = isObject(value.head) ? value.head : {}
    const b = isObject(value.base) ? value.base : {}
    const normalized = parsePullRequest({
      url: github ? value.html_url : value.web_url,
      repository: repo.url,
      head: github ? h.ref : value.source_branch,
      base: github ? b.ref : value.target_branch,
      sha: github ? h.sha : value.sha,
      draft: value.draft,
      merged: github ? value.merged : value.state === 'merged',
      state:
        value.state === 'merged' || value.merged === true
          ? 'merged'
          : value.state === 'open' || value.state === 'opened'
            ? 'open'
            : value.state === 'closed'
              ? 'closed'
              : 'unknown',
    })
    if (!normalized.url.startsWith(prefix))
      throw new Error('PR response belongs to a different repository')
    return {
      status: 'succeeded',
      ref: normalized.url,
      body: JSON.stringify(normalized),
      revision: normalized.sha,
      complete: true,
    }
  }
}
