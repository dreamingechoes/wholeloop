// Gemini system policy paths per platform, never replacing an administrator's existing policy.
import { lstatSync } from 'node:fs'

/** Keep native platform paths separate; an existing administrator policy must never be replaced. */
export function geminiSystemPaths(platform: NodeJS.Platform = process.platform) {
  const roots = { darwin: '/Library/Application Support/GeminiCli', linux: '/etc/gemini-cli' }
  if (platform !== 'darwin' && platform !== 'linux')
    throw new Error('Gemini observer policy currently supports macOS and Linux only')
  const root = roots[platform]
  return { settings: `${root}/settings.json`, defaults: `${root}/system-defaults.json` }
}

export function geminiManagedPolicy() {
  const paths = geminiSystemPaths()
  try {
    lstatSync(paths.settings)
    return { ...paths, present: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Cannot establish absence of managed Gemini policy; no client started')
    return { ...paths, present: false }
  }
}
