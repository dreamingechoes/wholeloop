// Gemini system policy paths per platform, never replacing an administrator's existing policy.
import { lstatSync, readdirSync } from 'node:fs'

/** Keep native platform paths separate; an existing administrator policy must never be replaced. */
export function geminiSystemPaths(platform: NodeJS.Platform = process.platform) {
  const roots = { darwin: '/Library/Application Support/GeminiCli', linux: '/etc/gemini-cli' }
  if (platform !== 'darwin' && platform !== 'linux')
    throw new Error('Gemini observer policy currently supports macOS and Linux only')
  const root = roots[platform]
  return {
    settings: `${root}/settings.json`,
    defaults: `${root}/system-defaults.json`,
    policies: `${root}/policies`,
  }
}

/**
 * Gemini ignores supplemental admin policies once the system policy directory
 * holds any .toml file, so wholeloop's own read-only policy would silently not
 * apply. An administrator's policy is then reported as present, never replaced.
 */
function systemPolicies(directory: string) {
  try {
    return readdirSync(directory).some((name) => name.endsWith('.toml'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw new Error('Cannot establish absence of managed Gemini policy; no client started')
  }
}

export function geminiManagedPolicy() {
  const paths = geminiSystemPaths()
  let settings = false
  try {
    lstatSync(paths.settings)
    settings = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Cannot establish absence of managed Gemini policy; no client started')
  }
  return { ...paths, present: settings || systemPolicies(paths.policies) }
}
