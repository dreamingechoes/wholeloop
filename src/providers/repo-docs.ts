// Publishes documents into the repository on explicit request, with locking kept in the external
// store.
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { StoreFiles } from '../state/files.js'
import { inside } from '../state/paths.js'
import type { OperationCall, OperationResult, ProviderHost } from './operations.js'

const digest = (content: string) => createHash('sha256').update(content).digest('hex')

/** Intentional documentation publication; locking state stays in the external store. */
export class RepositoryDocuments implements ProviderHost {
  constructor(
    readonly root: string,
    readonly files: StoreFiles,
  ) {}

  private path(ref: string): string {
    if (
      isAbsolute(ref) ||
      ref.includes('\\') ||
      ref.split('/').includes('..') ||
      !/^docs\/.+\.md$/.test(ref)
    )
      throw new Error('Repository documents must be Markdown paths under docs/')
    const root = realpathSync(this.root)
    const path = resolve(root, ref)
    let existing = path
    while (!existsSync(existing)) existing = dirname(existing)
    if (lstatSync(existing).isSymbolicLink())
      throw new Error('Repository docs cannot replace a symbolic link')
    if (!inside(root, realpathSync(existing)))
      throw new Error('Repository docs path escapes through a symlink')
    if (relative(root, realpathSync(existing)).split(/[\\/]/)[0] !== 'docs' && existing !== root)
      throw new Error('Repository docs path resolves outside docs/')
    return path
  }

  async invoke(call: OperationCall): Promise<OperationResult> {
    if (
      call.provider !== 'repo-docs' ||
      !['docs.create', 'docs.read', 'docs.update'].includes(call.operation)
    )
      throw new Error('Unsupported repository documentation operation')
    const { ref, body, revision } = call.args
    if (typeof ref !== 'string') throw new Error('Provide the repository document path')
    return this.files.locked(() => {
      const path = this.path(ref)
      if (call.operation === 'docs.read') {
        const content = readFileSync(path, 'utf8')
        return {
          status: 'succeeded',
          ref,
          body: content,
          revision: digest(content),
          complete: true,
        }
      }
      if (typeof body !== 'string') throw new Error('Provide a document body')
      if (
        call.operation === 'docs.update' &&
        (!existsSync(path) || digest(readFileSync(path, 'utf8')) !== revision)
      )
        throw new Error('Repository document revision conflict; read and review again')
      mkdirSync(dirname(path), { recursive: true })
      if (call.operation === 'docs.create') writeFileSync(path, body, { flag: 'wx' })
      else {
        // Stage only the intended document output beside its destination for an
        // atomic same-volume rename. Coordination state stays in the external store.
        const temporary = `${path}.wholeloop-${randomUUID()}.tmp`
        try {
          writeFileSync(temporary, body, { flag: 'wx' })
          if (digest(readFileSync(path, 'utf8')) !== revision)
            throw new Error('Repository document revision conflict; read and review again')
          renameSync(temporary, path)
        } finally {
          rmSync(temporary, { force: true })
        }
      }
      return { status: 'succeeded', ref, revision: digest(body), complete: true }
    })
  }
}
