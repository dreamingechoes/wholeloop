// Pins a candidate's actual files independently of HEAD and the index.
import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import { ENVIRONMENT_SNAPSHOT_LIMITS } from '../environment/candidates.js'
import { gitBytes } from '../worktrees/git.js'
import { readSourceBytes } from './input.js'

export interface CandidateFiles {
  digest: string
  index: string
  objectFormat: 'sha1' | 'sha256'
  files: number
  bytes: number
}
export class CandidateFilesError extends Error {
  constructor(readonly problem: string) {
    super(`Delivery candidate refused: ${problem}; file contents and paths omitted`)
  }
}
function utf8(bytes: Buffer) {
  const text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes)) throw new CandidateFilesError('path-encoding')
  return text
}

/** Pin actual files independently of HEAD/index, which controlled staging and commit intentionally change. */
export function candidateFiles(root: string): CandidateFiles {
  const bounds = ENVIRONMENT_SNAPSHOT_LIMITS,
    listed = () => gitBytes(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
    before = listed(),
    format = utf8(gitBytes(root, ['rev-parse', '--show-object-format'])).trim()
  if (!['sha1', 'sha256'].includes(format)) throw new CandidateFilesError('object-format')
  const objectFormat = format as CandidateFiles['objectFormat'],
    paths = [...new Set(utf8(before).split('\0').filter(Boolean))].sort((a, b) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b)),
    )
  if (paths.length > bounds.maxFiles) throw new CandidateFilesError('file-limit')
  const content = createHash('sha256'),
    index = createHash('sha256')
  const add = (value: string | Uint8Array) => {
    const bytes = typeof value === 'string' ? Buffer.from(value) : value
    content.update(String(bytes.length)).update(':').update(bytes).update('\0')
  }
  let bytes = 0,
    files = 0
  for (const path of paths) {
    let mode: number
    try {
      const stat = lstatSync(join(root, path))
      if (!stat.isFile() || stat.isSymbolicLink()) throw new CandidateFilesError('non-regular-file')
      mode = stat.mode
    } catch (error) {
      // A deleted tracked path disappears from the index during staging. Omitting
      // it in both observations preserves deletion without treating absence as data.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      if (error instanceof CandidateFilesError) throw error
      throw new CandidateFilesError('file-unavailable')
    }
    const body = readSourceBytes(root, path, bounds.maxFileBytes)
    // This observation retains hashes only. Prose credential heuristics would
    // misclassify ordinary source/type references without protecting stored data.
    bytes += body.length
    if (bytes > bounds.maxBytes) throw new CandidateFilesError('byte-limit')
    let after: ReturnType<typeof lstatSync>
    try {
      after = lstatSync(join(root, path))
    } catch {
      throw new CandidateFilesError('file-changed')
    }
    if (!after.isFile() || after.mode !== mode || after.size !== body.length)
      throw new CandidateFilesError('file-changed')
    add(path)
    add(String(mode))
    add(body)
    const blob = createHash(objectFormat).update(`blob ${body.length}\0`).update(body).digest('hex')
    // Compare this exact stream with the actual staged index. CRLF/encoding
    // transforms cannot masquerade as a byte-preserving candidate commit.
    index.update(`${mode & 0o100 ? '100755' : '100644'} ${blob} 0\t${path}\0`)
    files++
  }
  if (!listed().equals(before)) throw new CandidateFilesError('files-changed')
  return { digest: content.digest('hex'), index: index.digest('hex'), objectFormat, files, bytes }
}

export function candidateIndex(root: string): string {
  return createHash('sha256')
    .update(gitBytes(root, ['ls-files', '--stage', '-z']))
    .digest('hex')
}
