// Reads bounded local Git blobs in batches, without checkout files, filters or lazy network fetches.
import { spawnSync } from 'node:child_process'
import { type CitationCheck, codeCitations, excerptHash } from './citation-proof.js'
import type { AngleResult } from './contracts.js'

export const CITATION_FILE_BYTES = 1024 * 1024
export const CITATION_TOTAL_BYTES = 4 * 1024 * 1024
const OID = '(?:[a-f0-9]{40}|[a-f0-9]{64})'
const HEADER = new RegExp(`^(${OID}) (blob|commit|tree|tag) (\\d+)$`)
function gitRead(
  root: string,
  args: string[],
  input?: string,
  maxBuffer = CITATION_TOTAL_BYTES + 65536,
): Buffer {
  const result = spawnSync(
    'git',
    ['--no-lazy-fetch', '--no-replace-objects', '--no-optional-locks', ...args],
    {
      cwd: root,
      input,
      maxBuffer,
      timeout: 5000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_NO_LAZY_FETCH: '1',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
    },
  )
  if (result.error || result.status !== 0 || result.signal)
    throw new Error(
      'Local-only Git object inspection is unavailable; no fetch or fallback was attempted',
    )
  return result.stdout
}

export function localCodeRevision(root: string) {
  try {
    const [prefix, commit] = gitRead(
      root,
      ['rev-parse', '--show-prefix', '--verify', 'HEAD^{commit}'],
      undefined,
      8192,
    )
      .toString('utf8')
      .trimEnd()
      .split('\n')
    if (
      prefix === undefined ||
      !commit ||
      !new RegExp(`^${OID}$`).test(commit) ||
      /[\p{Cc}\p{Cf}]/u.test(prefix) ||
      prefix.split('/').some((part) => part === '..')
    )
      throw new Error('Unsupported repository prefix')
    return { repository: root, commit }
  } catch {
    return {
      repository: root,
      commit: null,
      reason: 'No local commit could be observed; versioned code citations remain unavailable',
    }
  }
}

export function checkCodeCitations(root: string, result: AngleResult, codeSource = true) {
  const parsed = codeCitations(result),
    problems = [...parsed.problems],
    checks: CitationCheck[] = []
  if (problems.length || !parsed.citations.length) return { checks, problems }
  if (!codeSource)
    return {
      checks,
      problems: parsed.citations.map(
        (citation) =>
          `Claim ${citation.claim}: versioned local code citations require an assigned source.code angle`,
      ),
    }
  try {
    const prefix = gitRead(root, ['rev-parse', '--show-prefix'], undefined, 8192)
      .toString('utf8')
      .replace(/\n$/, '')
    if (/[\p{Cc}\p{Cf}]/u.test(prefix) || prefix.split('/').some((part) => part === '..'))
      throw new Error('Unsupported repository prefix')
    const commits = [...new Set(parsed.citations.map(({ commit }) => commit))],
      paths = [
        ...new Set(parsed.citations.map(({ commit, path }) => `${commit}:${prefix}${path}`)),
      ],
      queries = [...commits, ...paths],
      rows = gitRead(
        root,
        ['cat-file', '--batch-check'],
        `${queries.join('\n')}\n`,
        2 * 1024 * 1024,
      )
        .toString('utf8')
        .trimEnd()
        .split('\n')
    if (rows.length !== queries.length) throw new Error('Incomplete Git object response')
    const metadata = new Map(
        queries.map((query, index) => [query, HEADER.exec(rows[index] ?? '')]),
      ),
      blobs = new Map<string, number>()
    let total = 0
    for (const path of paths) {
      const row = metadata.get(path),
        size = Number(row?.[3])
      if (
        row?.[2] === 'blob' &&
        Number.isSafeInteger(size) &&
        size <= CITATION_FILE_BYTES &&
        !blobs.has(row[1] ?? '')
      ) {
        if (total + size <= CITATION_TOTAL_BYTES) {
          blobs.set(row[1] ?? '', size)
          total += size
        }
      }
    }
    const contents = new Map<string, { lines: string[]; trailingNewline: boolean }>()
    if (blobs.size) {
      const bytes = gitRead(root, ['cat-file', '--batch'], `${[...blobs.keys()].join('\n')}\n`)
      let offset = 0
      for (const [oid, size] of blobs) {
        const end = bytes.indexOf(10, offset),
          header = HEADER.exec(bytes.subarray(offset, end).toString('ascii'))
        if (
          end < offset ||
          header?.[1] !== oid ||
          header[2] !== 'blob' ||
          Number(header[3]) !== size ||
          bytes[end + 1 + size] !== 10
        )
          throw new Error('Incomplete Git blob response')
        const body = bytes.subarray(end + 1, end + 1 + size),
          text = body.toString('utf8')
        if (Buffer.from(text, 'utf8').equals(body) && !text.includes('\0')) {
          const lines = text.replaceAll('\r\n', '\n').split('\n')
          if (text.endsWith('\n')) lines.pop()
          contents.set(oid, {
            lines: text.length ? lines : [],
            trailingNewline: text.endsWith('\n'),
          })
        }
        offset = end + size + 2
      }
      if (offset !== bytes.length) throw new Error('Unexpected Git blob response bytes')
    }
    for (const citation of parsed.citations) {
      const row = metadata.get(`${citation.commit}:${prefix}${citation.path}`),
        file = contents.get(row?.[1] ?? ''),
        fail = (reason: string) =>
          problems.push(`Claim ${citation.claim}, citation ${citation.evidence + 1}: ${reason}`)
      if (metadata.get(citation.commit)?.[2] !== 'commit') fail('commit is not locally available')
      else if (!row || row[2] !== 'blob')
        fail('file is not a locally available blob at that commit')
      else if (!file) fail('file is non-text or exceeds the bounded object read')
      else if (citation.end > file.lines.length) fail('line range is outside the committed file')
      else if (
        !(
          file.lines.slice(citation.start - 1, citation.end).join('\n') +
          (citation.end < file.lines.length || file.trailingNewline ? '\n' : '')
        ).includes(citation.excerpt.replaceAll('\r\n', '\n'))
      )
        fail('excerpt does not match the cited range')
      else
        checks.push({
          claim: citation.claim,
          evidence: citation.evidence,
          ref: citation.ref,
          excerptSha256: excerptHash(citation.excerpt),
          status: 'verified',
        })
    }
  } catch (error) {
    problems.push(
      ...parsed.citations.map(
        (citation) =>
          `Claim ${citation.claim}: ${error instanceof Error ? error.message : 'Local citation inspection unavailable'}`,
      ),
    )
  }
  return { checks, problems }
}
