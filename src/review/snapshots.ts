import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { changedPaths } from '../gates/snapshot.js'
import { canonicalPath, inside } from '../state/paths.js'
import { effectEpoch } from '../state/read-observation.js'
import type { StateStore } from '../state/store.js'
import { git, repository } from '../worktrees/git.js'

export interface SnapshotFile {
  path: string
  exists: boolean
  mode?: string
  oid?: string
}
interface Entry {
  mode: string
  oid: string
}

/** Changed-code objects and scratch indexes live outside Git; alternates are read-only. */
let decisionDiff: { key: string; epoch: number; patch: string } | undefined

export class ReviewSnapshots {
  readonly objects: string
  private readonly env: NodeJS.ProcessEnv
  constructor(
    readonly store: StateStore,
    readonly root: string,
  ) {
    const repo = repository(root)
    this.objects = `review/objects/${repo.key}`
    const directory = store.files.path(this.objects)
    const hooks = store.files.path('review/hooks-disabled')
    mkdirSync(directory, { recursive: true })
    mkdirSync(hooks, { recursive: true })
    this.env = {
      ...process.env,
      GIT_DIR: git(root, ['rev-parse', '--absolute-git-dir']).trim(),
      GIT_WORK_TREE: root,
      GIT_COMMON_DIR: repo.commonDir,
      GIT_OBJECT_DIRECTORY: directory,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(join(repo.commonDir, 'objects')),
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    }
  }
  private command(args: string[], input?: string | Buffer, index?: string): string {
    const hooks = this.store.files.path('review/hooks-disabled')
    const result = spawnSync(
      'git',
      [
        '-c',
        `core.hooksPath=${hooks}`,
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.splitIndex=false',
        '-c',
        'diff.autoRefreshIndex=false',
        ...args,
      ],
      {
        cwd: this.root,
        encoding: 'utf8',
        env: { ...this.env, ...(index ? { GIT_INDEX_FILE: index } : {}) },
        ...(input !== undefined ? { input } : {}),
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
      },
    )
    if (result.error || result.status !== 0)
      throw new Error(
        'Private review snapshot command failed; preserve its objects and inspect Git state',
      )
    return result.stdout
  }
  private tree(files: ReadonlyMap<string, Entry>): string {
    const index = this.store.files.path(`review/indexes/${randomUUID()}.index`)
    mkdirSync(dirname(index), { recursive: true })
    try {
      this.command(['read-tree', '--empty'], undefined, index)
      const entries = [...files]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, entry]) => `${entry.mode} blob ${entry.oid}\t${path}\0`)
        .join('')
      if (entries) this.command(['update-index', '-z', '--index-info'], entries, index)
      return this.command(['write-tree'], undefined, index).trim()
    } finally {
      rmSync(index, { force: true })
    }
  }
  capture(base: string, previous: readonly SnapshotFile[] = []) {
    const baseline = new Map<string, Entry>()
    for (const line of git(this.root, ['ls-tree', '-r', '-z', base]).split('\0').filter(Boolean)) {
      const tab = line.indexOf('\t')
      const [mode, type, oid] = line.slice(0, tab).split(' ')
      if (mode && type === 'blob' && oid) baseline.set(line.slice(tab + 1), { mode, oid })
    }
    const paths = [
      ...new Set([...previous.map((entry) => entry.path), ...changedPaths(this.root, base)]),
    ].sort()
    if (paths.length > 1000)
      throw new Error('Review snapshot exceeds 1000 paths; split the change before reviewing')
    const before = new Map<string, Entry>()
    const after = new Map<string, Entry>()
    const files: SnapshotFile[] = []
    // Read and validate all content before writing any new objects.
    const content: { path: string; mode: string; bytes: Buffer }[] = []
    for (const path of paths) {
      const prior = previous.find((entry) => entry.path === path)
      const old = prior
        ? prior.exists && prior.mode && prior.oid
          ? { mode: prior.mode, oid: prior.oid }
          : undefined
        : baseline.get(path)
      if (old) before.set(path, old)
      if (/(?:^|\/)(?:\.env(?:\.|$)|credentials(?:\.|$))|\.(?:pem|key|p12|pfx)$/.test(path))
        throw new Error(
          `Sensitive file requires owner inspection and is not copied into review state: ${path}`,
        )
      if (!inside(canonicalPath(this.root), canonicalPath(dirname(join(this.root, path)))))
        throw new Error('Review path parent escapes its repository')
      let stat: ReturnType<typeof lstatSync>
      try {
        stat = lstatSync(join(this.root, path))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          files.push({ path, exists: false })
          continue
        }
        throw error
      }
      if ((!stat.isFile() && !stat.isSymbolicLink()) || stat.size > 1024 * 1024)
        throw new Error('Review snapshots support regular files/symlinks under 1 MiB')
      const bytes = stat.isSymbolicLink()
        ? Buffer.from(readlinkSync(join(this.root, path)))
        : readFileSync(join(this.root, path))
      if (
        /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{40,})\b/.test(
          bytes.toString('utf8'),
        )
      )
        throw new Error(`Credential-shaped content is not copied into review state: ${path}`)
      content.push({
        path,
        mode: stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644',
        bytes,
      })
    }
    for (const file of content) {
      const oid = this.command(['hash-object', '-w', '--stdin', '--no-filters'], file.bytes).trim()
      after.set(file.path, { mode: file.mode, oid })
      files.push({ path: file.path, exists: true, mode: file.mode, oid })
    }
    return {
      before: this.tree(before),
      after: this.tree(after),
      objects: this.objects,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    }
  }
  diff(before: string, after: string): string {
    if (![before, after].every((oid) => /^[a-f0-9]{40,64}$/.test(oid)))
      throw new Error('Invalid private review tree reference')
    // Both trees are content-addressed objects in the private store, which only
    // wl writes. Within one synchronous decision and before any announced
    // effect, the same pair has the same patch (ADR-0243); callers still compare
    // its digest with the journal on every call.
    const key = JSON.stringify([this.store.files.path(this.objects), before, after]),
      epoch = effectEpoch()
    if (decisionDiff?.key === key && decisionDiff.epoch === epoch) return decisionDiff.patch
    const patch = this.command([
      'diff',
      '--binary',
      '--full-index',
      '--no-color',
      '--no-relative',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      '--diff-algorithm=myers',
      '--no-indent-heuristic',
      '--unified=3',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      before,
      after,
      '--',
    ])
    const entry = { key, epoch, patch }
    decisionDiff = entry
    queueMicrotask(() => {
      if (decisionDiff === entry) decisionDiff = undefined
    })
    return patch
  }
}
