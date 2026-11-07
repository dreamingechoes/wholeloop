import { posix } from 'node:path'
import { resolveSlot } from '../discovery/resolve.js'
import { SLOT_RULES } from '../discovery/rules.js'
import { fileKind, isGeneratedDistribution, scan } from '../discovery/scan.js'
import { gitObjects } from '../worktrees/git.js'
import {
  GUIDANCE_LIMITS,
  type GuidanceFile,
  type GuidancePin,
  guidanceManifest,
  INSTRUCTIONS_SLOT,
  sha256,
} from './guidance.js'

/**
 * Repository guidance read from a pinned base commit, never from a working
 * tree that can move (P6-40). One `ls-tree` and one `cat-file --batch` per
 * repository serve both the proposal and the runner's verification.
 */
interface Entry {
  oid: string
  size: number
}
// The same directories the working-tree inventory skips (src/discovery/tree.ts).
const IGNORED = new Set([
  '.git',
  'node_modules',
  'vendor',
  '.venv',
  'venv',
  'dist',
  'build',
  'target',
  'coverage',
  '.next',
  '.cache',
  '.tmp',
  '.tox',
  '.yarn',
])
const DISCOVERY_BYTES = 1024 * 1024

class BaseTree {
  readonly entries = new Map<string, Entry>()
  constructor(
    readonly root: string,
    readonly base: string,
  ) {
    // Regular files only: a symlink's target could name bytes outside the pinned tree.
    for (const line of gitObjects(root, ['ls-tree', '-r', '-z', '-l', '--full-tree', base])
      .toString('utf8')
      .split('\0')) {
      const match = /^(100644|100755) blob ([a-f0-9]{40,64}) +(\d+)\t(.+)$/s.exec(line)
      if (match?.[2] && match[3] && match[4])
        this.entries.set(match[4], { oid: match[2], size: Number(match[3]) })
    }
  }
  /** Every requested blob in one process; a missing or unreadable one fails the whole read. */
  read(paths: readonly string[]): Map<string, Buffer> {
    const result = new Map<string, Buffer>()
    const wanted = paths.map((path) => {
      const entry = this.entries.get(path)
      if (!entry) throw new Error('missing-guidance-file')
      return { path, entry }
    })
    if (!wanted.length) return result
    const output = gitObjects(
      this.root,
      ['cat-file', '--batch'],
      Buffer.from(wanted.map(({ entry }) => `${entry.oid}\n`).join('')),
    )
    let offset = 0
    for (const { path, entry } of wanted) {
      const header = output.indexOf(10, offset)
      if (header < 0) throw new Error('guidance-batch')
      const [oid, type, size] = output.subarray(offset, header).toString('utf8').split(' ')
      if (oid !== entry.oid || type !== 'blob' || Number(size) !== entry.size)
        throw new Error('guidance-batch')
      const start = header + 1
      result.set(path, output.subarray(start, start + entry.size))
      offset = start + entry.size + 1
    }
    return result
  }
  under(directory: string): string[] {
    const prefix = `${directory}/`
    return [...this.entries.keys()].filter((path) => path.startsWith(prefix)).sort()
  }
  /** Paths a working-tree discovery would scan, as they are at the base. */
  discoverable(): string[] {
    return [...this.entries]
      .filter(
        ([path, entry]) =>
          entry.size <= DISCOVERY_BYTES &&
          fileKind(path) !== undefined &&
          !isGeneratedDistribution(path) &&
          !path.split('/').some((part) => IGNORED.has(part)),
      )
      .map(([path]) => path)
      .sort()
  }
  /** Instruction files are recognised by path alone, so no blob is read to list them. */
  instructions(): string[] {
    return this.discoverable().filter((path) => fileKind(path) === 'instruction')
  }
}

function filesOf(paths: readonly string[], bytes: Map<string, Buffer>) {
  const files: GuidanceFile[] = paths.map((path) => {
    const content = bytes.get(path) as Buffer
    return { path, sha256: sha256(content), bytes: content.length }
  })
  if (
    !files.length ||
    files.length > GUIDANCE_LIMITS.files ||
    files.some((file) => file.bytes > GUIDANCE_LIMITS.fileBytes) ||
    files.reduce((total, file) => total + file.bytes, 0) > GUIDANCE_LIMITS.manifestBytes
  )
    throw new Error('guidance-too-large')
  return files
}
// Slots whose bound file is read as bytes by the core keep a single-file pin.
const FILE_SLOTS = new Set(['review.rubric', 'spec.template', 'frame.template'])

export interface GuidanceQuestion {
  id: string
  repository: string
  slot: string
  prompt: string
  options: { value: string; label: string }[]
}
export interface GuidanceProposal {
  schema: 'wholeloop/delivery-guidance@1'
  status: 'proposed' | 'needs-answers' | 'blocked'
  pins: GuidancePin[]
  questions: GuidanceQuestion[]
  skipped: { repository: string; slot: string; ref: string; reason: string }[]
  problems: { repository: string; file?: string; message: string }[]
}

/**
 * Propose the pins a supervised step would resolve for the same slots, read at
 * each repository's pinned base. Precedence is resolveSlot's: a configured
 * binding, then explicit slot tags, then name matches. User-level skills are
 * not candidates — they live outside the repository and could change after
 * authorization — so a slot only a user skill fills uses harness guidance.
 * Ambiguities become questions: a run without intervention cannot ask later.
 */
export function proposeGuidance(
  repositories: readonly { id: string; root: string; base: string }[],
  options: {
    bindings?: (repository: string) => Record<string, string>
    answers?: Readonly<Record<string, string>>
  } = {},
): GuidanceProposal {
  const proposal: GuidanceProposal = {
    schema: 'wholeloop/delivery-guidance@1',
    status: 'proposed',
    pins: [],
    questions: [],
    skipped: [],
    problems: [],
  }
  for (const repository of [...repositories].sort((a, b) => a.id.localeCompare(b.id))) {
    const tree = new BaseTree(repository.root, repository.base),
      discovered = tree.read(tree.discoverable()),
      map = scan(new Map([...discovered].map(([path, bytes]) => [path, bytes.toString('utf8')])))
    if (map.problems.length) {
      for (const problem of map.problems)
        proposal.problems.push({
          repository: repository.id,
          file: problem.file,
          message: problem.message,
        })
      continue
    }
    const bindings = options.bindings?.(repository.id) ?? {}
    const slots = new Set<string>(SLOT_RULES.map(([slot]) => slot))
    for (const asset of map.assets) for (const slot of asset.slots) slots.add(slot)
    for (const slot of Object.keys(bindings)) slots.add(slot)
    const selections: { slot: string; ref: string }[] = []
    for (const slot of [...slots].sort()) {
      const binding = bindings[slot]
      const resolution = resolveSlot(slot, map, binding ? { binding } : {})
      const question = resolution.questions[0]
      if (question) {
        const id = `${repository.id}:${question.id}`,
          answer = options.answers?.[id]
        if (answer === 'default') continue
        if (answer && question.options.some((option) => option.value === answer)) {
          selections.push({ slot, ref: answer })
          continue
        }
        proposal.questions.push({
          id,
          repository: repository.id,
          slot,
          prompt: question.prompt,
          options: [
            ...question.options,
            { value: 'default', label: 'harness: use wholeloop guidance' },
          ],
        })
        continue
      }
      if (resolution.selected && resolution.selected.origin !== 'harness')
        selections.push({ slot, ref: resolution.selected.ref })
    }
    const wanted = new Map<string, { slot: string; ref: string; paths: string[] }>()
    for (const { slot, ref } of selections) {
      const skill = ref.endsWith('/SKILL.md') && !FILE_SLOTS.has(slot)
      const paths = tree.entries.has(ref)
        ? skill
          ? tree.under(posix.dirname(ref))
          : [ref]
        : tree.under(ref.replace(/\/+$/, ''))
      if (!paths.length) {
        proposal.skipped.push({
          repository: repository.id,
          slot,
          ref,
          reason: ref.includes('#')
            ? 'A command, not guidance: the runtime recipe owns the suite'
            : 'No file or directory at the pinned base',
        })
        continue
      }
      wanted.set(slot, {
        slot,
        ref: skill ? posix.dirname(ref) : tree.entries.has(ref) ? ref : ref.replace(/\/+$/, ''),
        paths,
      })
    }
    const instructions = tree.instructions()
    // Discovery already read most of these; read only the rest, still in one process.
    const needed = [
      ...new Set([...[...wanted.values()].flatMap((entry) => entry.paths), ...instructions]),
    ]
    const bytes = new Map([
      ...discovered,
      ...tree.read(needed.filter((path) => !discovered.has(path))),
    ])
    try {
      if (instructions.length) {
        const files = filesOf(instructions, bytes)
        proposal.pins.push({
          slot: INSTRUCTIONS_SLOT,
          ref: '.',
          sha256: sha256(guidanceManifest('.', files)),
          repository: repository.id,
          files,
        })
      }
      for (const entry of wanted.values()) {
        const single = entry.paths.length === 1 && entry.paths[0] === entry.ref
        if (single) {
          const content = bytes.get(entry.ref) as Buffer
          if (content.length > GUIDANCE_LIMITS.fileBytes) throw new Error('guidance-too-large')
          proposal.pins.push({
            slot: entry.slot,
            ref: entry.ref,
            sha256: sha256(content),
            repository: repository.id,
          })
          continue
        }
        const files = filesOf(entry.paths, bytes)
        proposal.pins.push({
          slot: entry.slot,
          ref: entry.ref,
          sha256: sha256(guidanceManifest(entry.ref, files)),
          repository: repository.id,
          files,
        })
      }
    } catch {
      proposal.problems.push({
        repository: repository.id,
        message: `Guidance exceeds ${GUIDANCE_LIMITS.files} files, ${GUIDANCE_LIMITS.fileBytes} bytes per file or ${GUIDANCE_LIMITS.manifestBytes} bytes per pin; bind a smaller skill`,
      })
    }
  }
  proposal.pins.sort(
    (a, b) =>
      (a.repository ?? '').localeCompare(b.repository ?? '') || a.slot.localeCompare(b.slot),
  )
  proposal.status = proposal.problems.length
    ? 'blocked'
    : proposal.questions.length
      ? 'needs-answers'
      : 'proposed'
  return proposal
}

export interface PinnedGuidance {
  pin: GuidancePin
  /** The manifest bytes for a manifest pin, whose SHA-256 is the pin digest. */
  manifest?: Buffer
  files: { path: string; bytes: Buffer }[]
}

/**
 * The exact bytes behind each pin at its repository's base, or undefined when
 * any pin no longer matches: a changed file, a file added to or removed from a
 * pinned directory, or a different set of instruction files all refuse rather
 * than hand a worker bytes nobody authorized.
 */
export function readPinnedGuidance(
  repositories: readonly { id: string; root: string; base: string }[],
  pins: readonly GuidancePin[],
): PinnedGuidance[] | undefined {
  const trees = new Map<string, { tree: BaseTree; bytes: Map<string, Buffer> }>()
  try {
    for (const repository of repositories) {
      const own = pins.filter((pin) => pin.repository === repository.id)
      if (!own.length) continue
      const tree = new BaseTree(repository.root, repository.base)
      const paths = own.flatMap((pin) => (pin.files ? pin.files.map((f) => f.path) : [pin.ref]))
      trees.set(repository.id, { tree, bytes: tree.read([...new Set(paths)]) })
    }
    const result: PinnedGuidance[] = []
    for (const pin of pins) {
      const read = pin.repository ? trees.get(pin.repository) : undefined
      if (!read) return undefined
      if (!pin.files) {
        const bytes = read.bytes.get(pin.ref) as Buffer
        if (sha256(bytes) !== pin.sha256 || bytes.length > GUIDANCE_LIMITS.fileBytes)
          return undefined
        result.push({ pin, files: [{ path: pin.ref, bytes }] })
        continue
      }
      const expected =
        pin.slot === INSTRUCTIONS_SLOT ? read.tree.instructions() : read.tree.under(pin.ref)
      const manifest = guidanceManifest(pin.ref, pin.files)
      if (
        sha256(manifest) !== pin.sha256 ||
        expected.join('\0') !== pin.files.map((file) => file.path).join('\0') ||
        pin.files.some((file) => sha256(read.bytes.get(file.path) as Buffer) !== file.sha256)
      )
        return undefined
      result.push({
        pin,
        manifest,
        files: pin.files.map((file) => ({
          path: file.path,
          bytes: read.bytes.get(file.path) as Buffer,
        })),
      })
    }
    return result
  } catch {
    return undefined
  }
}
