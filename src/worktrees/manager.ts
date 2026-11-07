// Creates, stops and prunes slice worktrees, coordinated outside the journal lock.
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import {
  allocatePorts,
  type WorktreeAllocation,
  type WorktreeRecord,
  worktreeRecords,
} from './contracts.js'
import { ancestor, git, namedBase, registeredWorktrees, repository } from './git.js'

export class WorktreeManager {
  constructor(readonly engine: FlowEngine) {}

  list(): WorktreeRecord[] {
    return worktreeRecords(this.engine.store.events())
  }
  private get(subject: string): WorktreeRecord {
    const record = this.list().find((record) => record.subject === subject)
    if (!record) throw new Error(`No worktree allocation for ${subject}`)
    return record
  }

  /** Separate lifecycle coordination from the journal lock; never call this inside a store transaction. */
  private controlled<T>(operation: (hooks: string) => T): T {
    const control = new StoreFiles(join(this.engine.store.files.root, 'worktree-control'))
    return control.locked(() => {
      const hooks = control.path('hooks-disabled')
      mkdirSync(hooks, { recursive: true })
      return operation(hooks)
    })
  }

  private owned(record: WorktreeRecord) {
    if (
      record.mode === 'worktree' &&
      !inside(this.engine.store.files.root, canonicalPath(record.path))
    )
      throw new Error('Worktree path escapes the external store')
    const registered = registeredWorktrees(record.repository).find(
      (entry) => entry.path === record.path,
    )
    if (
      !registered ||
      registered.branch !== `refs/heads/${record.branch}` ||
      repository(record.path).commonDir !== record.commonDir
    )
      throw new Error('Worktree ownership or branch changed; inspect it before continuing')
    if (!ancestor(record.repository, record.base.sha, `refs/heads/${record.branch}`))
      throw new Error('Worktree branch no longer descends from its recorded base')
    return registered
  }

  create(subject: string, options: { repo?: string; base?: string; after?: string } = {}) {
    return this.controlled((hooks) => {
      const item = this.engine.store.get(subject)
      if (!['slice', 'part', 'review'].includes(item.kind) || item.status === 'closed')
        throw new Error('Create worktrees for an open slice, repository part or standalone review')
      const definition = [...this.engine.store.events()]
        .reverse()
        .find((entry) => entry.subject === subject && entry.type === 'slice.defined')
      if (definition?.type === 'slice.defined' && definition.data.repositories.length > 1)
        throw new Error('A multi-repository slice needs one worktree per part; provide a part ID')
      const declared =
        item.repository ??
        (definition?.type === 'slice.defined' ? definition.data.repositories[0]?.path : undefined)
      const repo = repository(
        options.repo ? resolve(this.engine.root, options.repo) : (declared ?? this.engine.root),
      )
      if (options.base && options.after) throw new Error('Choose --base or --after, not both')
      if (declared && repository(declared).commonDir !== repo.commonDir)
        throw new Error('Repository does not match the declared slice or part')
      const settings = this.engine.config().build
      const mode = isObject(settings) && settings.workspace === 'checkout' ? 'checkout' : 'worktree'
      if (
        mode === 'checkout' &&
        this.list().some(
          (entry) =>
            entry.subject !== subject &&
            entry.repoKey === repo.key &&
            entry.mode === 'checkout' &&
            ['active', 'creating', 'failed'].includes(entry.status),
        )
      )
        throw new Error('Checkout workspace is already leased; stop the other build first')
      let record = this.list().find((entry) => entry.subject === subject)
      const resumed = !!record
      if (record) {
        if (record.repoKey !== repo.key || record.mode !== mode)
          throw new Error('Existing allocation has a different repository or workspace mode')
        if (record.status === 'pruned' || record.abandoned)
          throw new Error(
            'Pruned or abandoned work cannot resume implicitly; inspect the retained branch',
          )
        if (options.base && namedBase(repo.path, options.base).ref !== record.base.ref)
          throw new Error('Existing allocation pins a different base')
        if (options.after && record.base.ref !== `refs/heads/wl/${options.after}`)
          throw new Error('Existing allocation pins a different stacked predecessor')
        if (record.status === 'active') {
          this.owned(record)
          return { schema: 'wholeloop/worktree-create@1', created: false, resumed: false, record }
        }
      } else {
        const predecessor = options.after ? this.get(options.after) : undefined
        if (
          predecessor &&
          (predecessor.repoKey !== repo.key ||
            !['active', 'stopped'].includes(predecessor.status) ||
            predecessor.abandoned)
        )
          throw new Error('Stack on active or stopped non-abandoned work in the same repository')
        if (!predecessor && !options.base)
          throw new Error('Provide --base <named-branch> or --after <slice-or-part>')
        const base = namedBase(
          repo.path,
          predecessor ? `refs/heads/${predecessor.branch}` : (options.base ?? ''),
        )
        const branch = `wl/${subject}`
        const target = predecessor?.target ?? base
        const path =
          mode === 'checkout'
            ? repo.path
            : canonicalPath(join(this.engine.store.files.root, 'worktrees', repo.key, subject))
        if (
          mode === 'worktree' &&
          (!inside(this.engine.store.files.root, path) || existsSync(path))
        )
          throw new Error('Worktree destination exists or escapes the external store')
        if (git(repo.path, ['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`]).trim())
          throw new Error(
            'Topic branch already exists without this allocation; choose new work explicitly',
          )
        const currentBranch = git(repo.path, ['branch', '--show-current']).trim()
        if (mode === 'checkout') {
          if (git(repo.path, ['status', '--porcelain=v1', '-z']).length)
            throw new Error('Checkout workspace must be clean')
        }
        const allocation: WorktreeAllocation = {
          repository: repo.path,
          commonDir: repo.commonDir,
          repoKey: repo.key,
          mode,
          path,
          branch,
          base,
          target,
          original: {
            sha: git(repo.path, ['rev-parse', 'HEAD']).trim(),
            ...(currentBranch ? { ref: `refs/heads/${currentBranch}` } : {}),
          },
          ports: allocatePorts(this.list()),
        }
        this.engine.store.transaction((_events, append) => {
          append(subject, { type: 'worktree.planned', data: { allocation } })
        })
        record = this.get(subject)
      }
      const allocation = record
      try {
        const branchExists = !!git(repo.path, [
          'for-each-ref',
          '--format=%(refname)',
          `refs/heads/${allocation.branch}`,
        ]).trim()
        if (allocation.mode === 'checkout') {
          const current = git(repo.path, ['branch', '--show-current']).trim()
          if (current !== allocation.branch) {
            if (
              (current ? `refs/heads/${current}` : undefined) !== allocation.original.ref ||
              (!current && git(repo.path, ['rev-parse', 'HEAD']).trim() !== allocation.original.sha)
            )
              throw new Error(
                'The checkout changed after allocation; preserve it and inspect before retrying',
              )
            if (git(repo.path, ['status', '--porcelain=v1', '-z']).length)
              throw new Error('Checkout workspace must be clean')
            git(
              repo.path,
              branchExists
                ? ['switch', allocation.branch]
                : ['switch', '-c', allocation.branch, allocation.base.sha],
              hooks,
            )
          }
        } else if (!existsSync(allocation.path)) {
          if (!inside(this.engine.store.files.root, canonicalPath(allocation.path)))
            throw new Error('Worktree destination escapes the external store')
          mkdirSync(join(allocation.path, '..'), { recursive: true })
          git(
            repo.path,
            branchExists
              ? ['worktree', 'add', '--', allocation.path, allocation.branch]
              : [
                  'worktree',
                  'add',
                  '-b',
                  allocation.branch,
                  '--',
                  allocation.path,
                  allocation.base.sha,
                ],
            hooks,
          )
        }
        this.owned(allocation)
        this.engine.store.transaction((_events, append) => {
          append(subject, { type: 'worktree.ready', data: {} })
        })
      } catch (error) {
        this.engine.store.transaction((_events, append) => {
          append(subject, {
            type: 'worktree.failed',
            data: {
              reason:
                'Provisioning failed; preserve the allocation and inspect Git state before retrying',
            },
          })
        })
        throw error
      }
      return {
        schema: 'wholeloop/worktree-create@1',
        created: !resumed,
        resumed,
        record: this.get(subject),
      }
    })
  }

  open(subject: string) {
    const record = this.get(subject)
    if (record.status === 'pruned')
      throw new Error('This worktree was pruned; inspect its retained branch')
    this.owned(record)
    return {
      schema: 'wholeloop/worktree-open@1',
      record,
      head: git(record.path, ['rev-parse', 'HEAD']).trim(),
      tested: false,
      environment: {
        WL_SUBJECT: subject,
        PORT: String(record.ports.start),
        WL_PORT_START: String(record.ports.start),
        WL_PORT_END: String(record.ports.end),
      },
      commands: discover(record.path, this.engine.store.files, this.engine.home).repo.commands,
      stop: "Opening an environment does not record the person's test-it decision. Commands are suggestions, never executed here.",
    }
  }

  stop(subject: string, abandoned?: string) {
    if (abandoned !== undefined && !abandoned.trim())
      throw new Error('Abandonment needs an explicit reason')
    return this.controlled(() => {
      const record = this.get(subject)
      if (
        record.status !== 'pruned' &&
        (record.status !== 'stopped' || (abandoned && abandoned !== record.abandoned))
      )
        this.engine.store.transaction((_events, append) => {
          append(
            subject,
            abandoned
              ? { type: 'worktree.abandoned', data: { reason: abandoned } }
              : { type: 'worktree.stopped', data: {} },
          )
        })
      return {
        schema: 'wholeloop/worktree-stop@1',
        record: this.get(subject),
        processes:
          'No worker or dev-server processes are managed by this command; branches and files are retained.',
      }
    })
  }

  prune(subject?: string, dryRun = false) {
    const run = (hooks?: string) => {
      if (subject) this.get(subject)
      const actions = this.list()
        .filter((record) => !subject || record.subject === subject)
        .map((record) => {
          const skip = (reason: string) => ({
            subject: record.subject,
            action: 'retained',
            reason,
            path: record.path,
          })
          let outputChanged = false
          try {
            if (record.status === 'pruned') return skip('Already pruned; branch retained')
            if (['active', 'creating'].includes(record.status))
              return skip('Stop active work before cleanup')
            const branch = `refs/heads/${record.branch}`
            let reason: 'merged' | 'abandoned'
            if (record.abandoned) reason = 'abandoned'
            else {
              const target = namedBase(record.repository, record.target.ref)
              if (!ancestor(record.repository, branch, target.sha))
                return skip('Topic branch is not merged into the recorded integration base')
              reason = 'merged'
            }
            const registered = registeredWorktrees(record.repository).find(
              (entry) => entry.path === record.path,
            )
            if (existsSync(record.path)) {
              const owned = this.owned(record)
              if (owned.locked) return skip('Git worktree is locked')
              if (git(record.path, ['status', '--porcelain=v1', '-z']).length)
                return skip('Working tree contains changes; preserve them before cleanup')
            } else if (registered)
              return skip('Missing registered worktree; inspect Git metadata before cleanup')
            if (!dryRun) {
              if (existsSync(record.path)) {
                if (record.mode === 'worktree')
                  git(record.repository, ['worktree', 'remove', '--', record.path], hooks)
                else
                  git(
                    record.repository,
                    record.original.ref
                      ? ['switch', record.original.ref.replace(/^refs\/heads\//, '')]
                      : ['switch', '--detach', record.original.sha],
                    hooks,
                  )
              }
              outputChanged = true
              this.engine.store.transaction((_events, append) => {
                append(record.subject, { type: 'worktree.pruned', data: { reason } })
              })
            }
            return {
              subject: record.subject,
              action: dryRun ? 'would-prune' : 'pruned',
              reason,
              path: record.path,
              branchRetained: true,
              checkoutRetained: record.mode === 'checkout',
            }
          } catch (error) {
            return {
              ...skip(
                error instanceof Error
                  ? error.message
                  : 'Cleanup blocked; inspect the recorded workspace',
              ),
              action: outputChanged ? 'recovery-needed' : 'retained',
            }
          }
        })
      return { schema: 'wholeloop/worktree-prune@1', dryRun, actions }
    }
    return dryRun ? run() : this.controlled(run)
  }
}
