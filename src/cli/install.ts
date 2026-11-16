// `wl install` and `wl uninstall`: native overlay installation for each client.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { openCodeVersionProbe } from '../diagnostics/doctor.js'
import { TARGETS } from '../installation/contracts.js'
import { manageInstallation } from '../installation/manage.js'
import { storePath } from '../state/paths.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
import { installationSummary } from './summary.js'
export function installationCommand(
  action: 'install' | 'uninstall',
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const scope = options['--scope']
  const target = options['--target']
  if (positional.length || (scope !== 'user' && scope !== 'project') || typeof target !== 'string')
    throw new CliError('Use install|uninstall --target <cli,...|all> --scope user|project')
  try {
    const targets = target === 'all' ? TARGETS : target.split(',')
    const opencodeVersion =
      action === 'install' && targets.includes('opencode')
        ? openCodeVersionProbe(process.env, root).version
        : undefined
    const result = manageInstallation(action, {
      context: {
        root,
        home: homedir(),
        store:
          typeof options['--store'] === 'string' ? resolve(root, options['--store']) : storePath(),
        scope,
        ...(opencodeVersion ? { opencodeVersion } : {}),
      },
      targets,
      canonical: bundledCanonical(),
      core: readFileSync(fileURLToPath(import.meta.url), 'utf8'),
      version: VERSION,
      dryRun: options['--dry-run'] === true,
    })
    io.out(json ? JSON.stringify(result) : installationSummary(result))
    return 0
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : 'Native installation failed', 3)
  }
}
