import { validate } from '../config/schema.js'
import { canonicalDigest } from './canonical.js'
import type { RenderedFile } from './contracts.js'
import { ADAPTERS, artifactDigest, generateAdapter } from './generate.js'
import distributionSchema from './schemas/distribution-v1.json' with { type: 'json' }

/** Export reviewable delivery trees; this neither publishes nor installs a client. */
export function generateDistribution(
  canonical: ReadonlyMap<string, string>,
  core: string,
  version: string,
) {
  const files = new Map<string, RenderedFile>()
  const targets = ADAPTERS.map((adapter) => {
    const generated = generateAdapter(adapter.id, canonical, core, version)
    for (const [path, file] of generated.files) files.set(`${adapter.id}/${path}`, file)
    return {
      target: adapter.id,
      path: adapter.id,
      manifest: `${adapter.id}/wholeloop-artifacts.json`,
      skills: generated.manifest.skills.length,
      agents: generated.manifest.agents.length,
      nativeManifest: `${adapter.id}/${adapter.manifestPath}`,
      capabilities: generated.manifest.capabilities,
    }
  })
  files.set('.claude-plugin/marketplace.json', {
    mode: 0o644,
    content: `${JSON.stringify(
      {
        name: 'wholeloop',
        description: 'Self-contained wholeloop development steps with an external journal.',
        owner: { name: 'wholeloop maintainers' },
        plugins: [
          {
            name: 'wholeloop',
            source: './claude',
            version,
            description: 'Evidence-backed development steps with a bundled deterministic core.',
          },
        ],
      },
      null,
      2,
    )}\n`,
  })
  const manifest = {
    schema: 'wholeloop/distribution-artifacts@1',
    target: 'distribution',
    version,
    source: canonicalDigest(canonical),
    core: artifactDigest(core),
    publication: 'not-performed',
    conformance: 'unverified',
    targets,
    limitations: [
      'This is a local delivery preview, not a publication or native conformance pass.',
      'Public repository visibility, npm ownership/provenance, remote marketplace hosting and release activation need separate owner action.',
      'Compiled binaries, npm archives and release automation are separate distribution work.',
    ],
    files: [...files].map(([path, file]) => ({
      path,
      mode: file.mode,
      sha256: artifactDigest(file.content),
    })),
  }
  if (validate(manifest, distributionSchema).length)
    throw new Error('Generated distribution manifest violates its versioned contract')
  files.set('wholeloop-artifacts.json', {
    mode: 0o644,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })
  return { manifest, files }
}
