import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DeliveryRunnerError } from './route.js'

declare const __WL_CONTROLLER_SHA256__: string | undefined
export const CONTROLLER_BUNDLE = 'wl-runner.mjs'

/**
 * The installed controller bundle beside the core, verified against the digest
 * the build embedded (ADR-0205). It composes the fixed domain adapters, which
 * would push the single-file core past the 4 MiB bound that hook and install
 * copies enforce. A build without the digest, such as tests that run sources,
 * has no bundle; an installed core whose bundle is missing or changed refuses
 * rather than silently running a controller that composes nothing.
 */
export function controllerBundle(core: string): string | undefined {
  const expected =
    typeof __WL_CONTROLLER_SHA256__ === 'string' ? __WL_CONTROLLER_SHA256__ : undefined
  if (!expected) return undefined
  const path = join(dirname(realpathSync(core)), CONTROLLER_BUNDLE)
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > 32 * 1024 * 1024)
    throw new DeliveryRunnerError('public-host-controller-bundle')
  const canonical = realpathSync(path)
  if (createHash('sha256').update(readFileSync(canonical)).digest('hex') !== expected)
    throw new DeliveryRunnerError('public-host-controller-bundle')
  return canonical
}
