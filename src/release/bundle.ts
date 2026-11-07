import { createHash } from 'node:crypto'
import { validate } from '../config/schema.js'
import type { releasePreflight } from './preflight.js'
import bundleSchema from './schemas/bundle-v1.json' with { type: 'json' }

/** The prepared payloads, sorted. The SBOM lists the packages bundled into the CLI (P7-05). */
export const RELEASE_FILES = [
  'release-notes.md',
  'sbom.cdx.json',
  'wholeloop-native.tar.gz',
  'wholeloop-npm.tgz',
  'wl.mjs',
] as const

export interface ReleaseBundle {
  schema: 'wholeloop/release-bundle@1'
  repository: string
  commit: string
  workflow: string
  version: string
  tag: string
  npmTag: 'latest' | 'next'
  from: string
  files: { path: string; bytes: number; sha256: string }[]
}

export const releaseDigest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Verify the prepared bytes against an independently retained manifest digest before activation. */
export function verifyReleaseBundle(
  manifest: unknown,
  files: ReadonlyMap<string, Uint8Array>,
  preflight: ReturnType<typeof releasePreflight>,
) {
  if (validate(manifest, bundleSchema).length)
    throw new Error('Invalid wholeloop/release-bundle@1 metadata; contents omitted')
  const bundle = manifest as ReleaseBundle
  if (preflight.status !== 'ready') throw new Error('Release source consistency is blocked')
  for (const key of ['repository', 'commit', 'workflow', 'version', 'tag', 'npmTag'] as const)
    if (bundle[key] !== preflight[key])
      throw new Error('Release bundle differs from source context')
  if (
    JSON.stringify([...files.keys()].sort()) !== JSON.stringify(RELEASE_FILES) ||
    JSON.stringify(bundle.files.map((entry) => entry.path).sort()) !== JSON.stringify(RELEASE_FILES)
  )
    throw new Error('Release bundle must contain exactly the prepared payload files')
  for (const entry of bundle.files) {
    const bytes = files.get(entry.path)
    if (!bytes || bytes.byteLength !== entry.bytes || releaseDigest(bytes) !== entry.sha256)
      throw new Error('Release payload size or digest differs from the prepared manifest')
  }
  return {
    schema: 'wholeloop/release-verified@1',
    status: 'verified',
    repository: bundle.repository,
    commit: bundle.commit,
    workflow: bundle.workflow,
    version: bundle.version,
    tag: bundle.tag,
    npmTag: bundle.npmTag,
    files: bundle.files,
    publication: 'not-performed',
    limitations: [
      'Byte and source consistency do not authorize publication or prove native acceptance, npm ownership, OIDC configuration or provenance.',
      'Retain the manifest digest independently; replacing both payload and expected digest defeats this comparison.',
    ],
  }
}
