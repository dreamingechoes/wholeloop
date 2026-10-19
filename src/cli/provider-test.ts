import { readFileSync } from 'node:fs'
import { loadExtensionOptions } from '../config/load.js'
import { providerFixtures } from '../providers/fixtures.js'
import { loadProviders } from '../providers/load.js'
import type { parseArguments } from './arguments.js'
import { EXIT, type Io } from './io.js'
import { providerCommand } from './provider.js'

export async function providerFixtureCommand(
  parsed: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (typeof parsed.options['--fixtures'] !== 'string')
    return providerCommand('provider test', parsed, root, json, io)
  if (parsed.positional.length !== 1) throw new Error('Provide one provider id')
  let input: unknown
  try {
    input = JSON.parse(readFileSync(parsed.options['--fixtures'], 'utf8'))
  } catch {
    throw new Error('Cannot read provider fixtures; contents omitted')
  }
  const registry = loadProviders(loadExtensionOptions({ root }))
  if (registry.problems.length)
    throw new Error('Resolve provider registry problems before fixture tests')
  const provider = registry.providers.find((entry) => entry.manifest.id === parsed.positional[0])
  if (!provider) throw new Error('Unknown provider fixture target')
  const result = await providerFixtures(provider, input)
  io.out(JSON.stringify(result, null, json ? undefined : 2))
  return result.passed ? EXIT.ok : EXIT.shape
}
