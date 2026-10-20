import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'

const sha256 = process.env.RELEASE_MANIFEST_SHA256
const artifact = new URL(process.env.RELEASE_ARTIFACT_URL ?? '')
assert(/^[a-f0-9]{64}$/.test(sha256 ?? ''))
assert.equal(artifact.origin, 'https://github.com')
assert(!artifact.username && !artifact.password && !artifact.search && !artifact.hash)
assert(
  /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+\/artifacts\/\d+$/.test(
    artifact.pathname,
  ),
)
appendFileSync(
  process.env.GITHUB_STEP_SUMMARY,
  [
    '## Prepared release',
    '',
    `Review the [exact artifact](${artifact.href}) before approving the release environment.`,
    '',
    `Manifest SHA-256: ${sha256}`,
    '',
    'Inspect bundle.json, release-notes.md, the npm archive and the complete native tar tree.',
    '',
    process.env.RELEASE_PUBLISH_REQUESTED === 'true'
      ? 'Publication was requested. Approval activates these exact bytes; no rebuild follows.'
      : 'Preparation only: no publication job was requested.',
    '',
    'GitHub and npm publication are not atomic. Preserve partial outcomes and reconcile them before retrying.',
    '',
  ].join('\n'),
)
