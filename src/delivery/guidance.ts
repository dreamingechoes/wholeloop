// Repository guidance pinned into an autonomous plan and the slots each role receives (ADR-0207).
import { createHash } from 'node:crypto'
import { knownSlot } from '../discovery/rules.js'
import type { WorkerRole } from './worker-protocol.js'

/**
 * Repository guidance pinned into an autonomous plan (P6-40, ADR-0207).
 *
 * Workers run with native skill and project-instruction loading disabled, so
 * these pins are the only way repository knowledge reaches them. A pin is
 * either one file, or a manifest of files (a multi-file skill directory, or
 * the repository's instruction files) whose digest is the digest of the
 * canonical manifest bytes. Every worker receives only the slots its role
 * needs: a reviewer is not told how to build, a builder is not handed the
 * review rubric.
 */
export interface GuidanceFile {
  path: string
  sha256: string
  bytes: number
}
export interface GuidancePin {
  slot: string
  ref: string
  sha256: string
  repository?: string
  files?: GuidanceFile[]
}

/** The repository's own instruction files (AGENTS.md and its client-specific peers). */
export const INSTRUCTIONS_SLOT = 'repo.instructions'
export const GUIDANCE_LIMITS = { fileBytes: 256 * 1024, files: 32, manifestBytes: 512 * 1024 }

export function knownGuidanceSlot(slot: string): boolean {
  return slot === INSTRUCTIONS_SLOT || knownSlot(slot)
}

const PLANNING = ['planner', 'challenger'] as const
const RESEARCH = ['researcher', 'planner', 'challenger'] as const
/**
 * Which roles a slot reaches. Instructions reach everyone, as a native client
 * would load them for any session in the repository. Anything unlisted
 * reaches no worker rather than every worker: a new slot must say who needs it.
 */
export function guidanceRoles(slot: string): readonly WorkerRole[] {
  if (slot === INSTRUCTIONS_SLOT)
    return ['builder', 'verifier', 'reviewer', 'refuter', 'researcher', 'planner', 'challenger']
  if (/^build\./.test(slot) || ['commit.convention', 'open-pr.convention'].includes(slot))
    return ['builder']
  if (slot === 'verify.suite') return ['builder', 'verifier']
  if (slot === 'review.rubric') return ['reviewer', 'refuter']
  if (slot === 'flags.naming') return ['builder', 'planner']
  if (['frame.template', 'spec.template', 'slice.conventions'].includes(slot)) return PLANNING
  if (slot === 'research.method') return RESEARCH
  if (
    ['comms.voice', 'launch.templates', 'ramp.criteria', 'learn.report', 'learn.decision'].includes(
      slot,
    )
  )
    return RESEARCH
  return []
}

export function guidanceForRole<T extends Pick<GuidancePin, 'slot'>>(
  guidance: readonly T[],
  role: WorkerRole,
): T[] {
  return guidance.filter((pin) => guidanceRoles(pin.slot).includes(role))
}

/** Canonical manifest bytes; the pin digest is their SHA-256. */
export function guidanceManifest(ref: string, files: readonly GuidanceFile[]): Buffer {
  return Buffer.from(
    `${JSON.stringify({ schema: 'wholeloop/guidance-manifest@1', ref, files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })) })}\n`,
  )
}

export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\0\r\n]{1,1024}$/

/** Shape checks a plan can make without reading a repository. */
export function guidanceShapeProblem(pin: Readonly<GuidancePin>): string | undefined {
  if (!knownGuidanceSlot(pin.slot)) return 'unknown-guidance-slot'
  if (pin.slot === INSTRUCTIONS_SLOT && !pin.files) return 'guidance-manifest'
  if (!pin.files) return undefined
  const files = pin.files
  if (
    !files.length ||
    files.length > GUIDANCE_LIMITS.files ||
    files.some(
      (file, index) =>
        !SAFE_PATH.test(file.path) ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        file.bytes > GUIDANCE_LIMITS.fileBytes ||
        (index > 0 && (files[index - 1] as GuidanceFile).path >= file.path) ||
        (pin.ref !== '.' && !file.path.startsWith(`${pin.ref}/`)),
    ) ||
    files.reduce((total, file) => total + file.bytes, 0) > GUIDANCE_LIMITS.manifestBytes ||
    sha256(guidanceManifest(pin.ref, files)) !== pin.sha256
  )
    return 'guidance-manifest'
  return undefined
}

/**
 * A worker's guidance context must hold every pin of its role, each manifest
 * file included. Role selection itself happens where context is composed
 * (guidanceContext in the public composition); the claim does not refuse
 * extra guidance, because a host may legitimately add context and refusing it
 * here would turn a composition detail into a claim failure.
 */
export function guidanceContextProblem(
  guidance: readonly GuidancePin[],
  role: WorkerRole,
  context: readonly { kind: string; artifact: { sha256: string } }[],
): 'missing-guidance' | undefined {
  const given = new Set(
    context.filter((entry) => entry.kind === 'guidance').map((entry) => entry.artifact.sha256),
  )
  return guidanceForRole(guidance, role)
    .flatMap((pin) => [pin.sha256, ...(pin.files ?? []).map((file) => file.sha256)])
    .some((digest) => !given.has(digest))
    ? 'missing-guidance'
    : undefined
}
