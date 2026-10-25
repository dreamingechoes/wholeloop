import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryBudgets } from '../delivery/budgets.js'
import { readSourceBytes, readSourceFile, rejectSourceCredentials } from '../delivery/input.js'
import {
  ACCEPTANCE_SCHEMAS,
  type AcceptanceArtifact,
  AcceptanceError,
  acceptanceShape,
} from './contracts.js'

const MAXIMUM = 20 * 1024 * 1024,
  CHUNK = 8 * 1024 * 1024
/** Reuse finite run accounting without changing the frozen eight-MiB budget artifact contract. */
export class AcceptanceArtifacts {
  constructor(readonly budgets: DeliveryBudgets) {}
  capture(run: string, input: Uint8Array, mediaType: AcceptanceArtifact['mediaType']) {
    if (
      ![
        'text/plain',
        'application/json',
        'image/png',
        'image/jpeg',
        'video/webm',
        'application/zip',
        'application/octet-stream',
      ].includes(mediaType)
    )
      throw new AcceptanceError('artifact-media-type')
    if (input.byteLength > MAXIMUM) throw new AcceptanceError('artifact-size')
    const body = Buffer.from(input)
    try {
      rejectSourceCredentials(body.toString('utf8'))
    } catch {
      throw new AcceptanceError('credential-bearing-artifact')
    }
    const chunks: AcceptanceArtifact['chunks'] = []
    for (let offset = 0; offset < body.length || offset === 0; offset += CHUNK) {
      const captured = this.budgets.captureArtifact(run, body.subarray(offset, offset + CHUNK))
      if (!captured.stored) throw new AcceptanceError(captured.reason ?? 'artifact-not-stored')
      chunks.push(captured.artifact)
    }
    const artifact: AcceptanceArtifact = {
      schema: 'wholeloop/acceptance-artifact@1',
      run,
      sha256: createHash('sha256').update(body).digest('hex'),
      bytes: body.length,
      mediaType,
      chunks,
      retention: 'retain',
      sharing: 'not-authorized',
    }
    acceptanceShape(artifact, ACCEPTANCE_SCHEMAS.artifact)
    const digest = contractDigest(artifact),
      files = this.budgets.lifecycle.journal.files
    files.locked(() => {
      const path = this.path(run, digest)
      if (existsSync(files.path(path))) {
        if (contractDigest(this.read(run, digest).artifact) !== digest)
          throw new AcceptanceError('changed-artifact')
      } else files.atomic(path, `${JSON.stringify(artifact)}\n`)
    })
    return this.read(run, digest)
  }
  read(run: string, digest: string) {
    const files = this.budgets.lifecycle.journal.files
    const artifact = JSON.parse(
      readSourceFile(files.root, this.path(run, digest), 65536),
    ) as AcceptanceArtifact
    acceptanceShape(artifact, ACCEPTANCE_SCHEMAS.artifact)
    if (artifact.run !== run || contractDigest(artifact) !== digest)
      throw new AcceptanceError('artifact-identity')
    const registered = this.budgets.inspect(run).artifacts
    const hash = createHash('sha256')
    let length = 0
    for (const chunk of artifact.chunks) {
      const expected = `delivery/artifacts/${run}/${chunk.digest}`
      if (chunk.ref !== expected || files.path(expected) !== resolve(files.root, expected))
        throw new AcceptanceError('artifact-boundary')
      if (
        !registered.some(
          (entry) =>
            entry.digest === chunk.digest &&
            entry.bytes === chunk.bytes &&
            entry.status === 'observed',
        )
      )
        throw new AcceptanceError('artifact-not-observed')
      const bytes = readSourceBytes(files.root, expected, CHUNK)
      if (
        bytes.length !== chunk.bytes ||
        createHash('sha256').update(bytes).digest('hex') !== chunk.digest
      )
        throw new AcceptanceError('artifact-bytes-changed')
      hash.update(bytes)
      length += bytes.length
    }
    if (length !== artifact.bytes || hash.digest('hex') !== artifact.sha256)
      throw new AcceptanceError('artifact-content-changed')
    return { digest, artifact }
  }
  private path(run: string, digest: string) {
    if (!/^delivery-[a-f0-9]{16}$/.test(run) || !/^[a-f0-9]{64}$/.test(digest))
      throw new AcceptanceError('artifact-id')
    return `delivery/acceptance-artifacts/${run}/${digest}.json`
  }
}
