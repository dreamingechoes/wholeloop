// `wl doctor`: runs the installation diagnostics and prints their report.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { DOCTOR_TARGETS, doctor, expectedArtifact } from '../diagnostics/doctor.js'
import { storePath } from '../state/paths.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
export function doctorCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (positional.length) throw new CliError('Doctor does not take positional arguments')
  const targets =
    typeof options['--target'] === 'string' ? options['--target'].split(',') : undefined
  if (
    targets &&
    (!targets.length ||
      new Set(targets).size !== targets.length ||
      targets.some((target) => !DOCTOR_TARGETS.includes(target as (typeof DOCTOR_TARGETS)[number])))
  )
    throw new CliError(
      'Choose unique doctor targets: claude,codex,opencode,copilot,gemini,antigravity,cursor',
    )
  const artifact =
    typeof options['--artifact'] === 'string' ? resolve(root, options['--artifact']) : undefined
  if (artifact && targets?.length !== 1)
    throw new CliError('Use exactly one --target with --artifact')
  const canonical = bundledCanonical()
  const core = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const report = doctor({
    root,
    managed: { canonical, core, version: VERSION },
    home: homedir(),
    store: typeof options['--store'] === 'string' ? resolve(root, options['--store']) : storePath(),
    ...(targets ? { targets } : {}),
    ...(artifact
      ? {
          artifact: {
            path: artifact,
            target: targets?.[0] ?? '',
            expected: expectedArtifact(targets?.[0] ?? '', artifact, canonical, core, VERSION),
          },
        }
      : {}),
  })
  io.out(JSON.stringify(report, null, json ? undefined : 2))
  return report.status === 'observed' ? 0 : 3
}
