import { isObject, validate } from '../config/schema.js'
import { conformanceBinary } from './recipes.js'
import schema from './schemas/downloads-v1.json' with { type: 'json' }

export const NATIVE_PACKAGES: Readonly<Record<string, string>> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  opencode: 'opencode-ai',
  copilot: '@github/copilot',
  gemini: '@google/gemini-cli',
}
interface Download {
  cli: string
  channel: 'pinned' | 'latest'
  version: string
  url: string
  integrity: string
}

/** Bind moving host observations to closed vendor paths before any installation. */
export function conformanceAcquisition(input: unknown) {
  if (isObject(input) && Array.isArray(input.entries) && input.entries.length > 14)
    throw new Error('At most fourteen native downloads are supported')
  if (validate(input, schema).length)
    throw new Error('Invalid wholeloop/conformance-downloads@1 input; contents omitted')
  const { platform, arch, entries } = input as {
    platform: 'darwin' | 'linux'
    arch: 'arm64' | 'x64'
    entries: Download[]
  }
  const seen = new Set<string>()
  const downloads = entries.map((entry) => {
    if (entry.version.length > 128 || entry.url.length > 2048 || entry.integrity.length > 128)
      throw new Error('Native metadata exceeds its field budget')
    const key = `${entry.cli}/${entry.channel}`
    if (seen.has(key)) throw new Error('Duplicate native CLI/channel')
    seen.add(key)
    const packageName = NATIVE_PACKAGES[entry.cli]
    let expected: string | RegExp
    if (packageName) {
      const name = packageName.split('/').at(-1)
      expected = `https://registry.npmjs.org/${packageName}/-/${name}-${entry.version}.tgz`
    } else if (entry.cli === 'cursor') {
      if (!/^\d{4}\.\d{2}\.\d{2}-[a-f0-9]{7,40}$/.test(entry.version))
        throw new Error('Cursor needs an exact dated release')
      expected = `https://downloads.cursor.com/lab/${entry.version}/${platform}/${arch}/agent-cli-package.tar.gz`
    } else {
      const nativeArch = arch === 'arm64' ? 'arm' : 'x64'
      const fileArch = arch === 'arm64' ? 'arm64' : 'x64'
      const system = platform === 'darwin' ? 'mac' : 'linux'
      const escapedVersion = entry.version.replaceAll('.', '\\.')
      expected = new RegExp(
        `^https://storage\\.googleapis\\.com/antigravity-public/antigravity-cli/${escapedVersion}-[0-9]+/${platform}-${nativeArch}/cli_${system}_${fileArch}\\.tar\\.gz$`,
      )
    }
    if (typeof expected === 'string' ? entry.url !== expected : !expected.test(entry.url))
      throw new Error('Native download does not match its closed vendor/version/platform path')
    // Cursor publishes no expected archive digest in its installer. Preserve that gap;
    // an observed post-download hash is not an independently authenticated checksum.
    if (
      entry.integrity === ''
        ? entry.cli !== 'cursor'
        : !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity)
    )
      throw new Error('Require a SHA-512 vendor integrity value except for Cursor')
    return {
      ...entry,
      kind: packageName ? 'npm' : 'archive',
      ...(packageName ? { package: packageName } : {}),
      command: conformanceBinary(entry.cli),
      directory: key,
      stripComponents: entry.cli === 'cursor' ? 1 : 0,
    }
  })
  return {
    schema: 'wholeloop/conformance-acquisition@1',
    platform,
    arch,
    downloads,
    collection: {
      schema: 'wholeloop/conformance-collection@1',
      entries: downloads.map(({ cli, channel, version }) => ({ cli, channel, pin: version })),
    },
    effects: 'not-performed',
    limitations: [
      'Imported vendor metadata is not authenticated by this plan. Installation executes trusted vendor code separately.',
      'Exact top-level versions and archive digests do not freeze transitive dependencies, native postinstall downloads or auto-updates.',
      'Cursor provides no expected archive digest here; record its observed digest without claiming independent integrity.',
      'Only macOS and glibc Linux on arm64/x64 are planned; native operation on each platform remains separate evidence.',
    ],
  }
}
