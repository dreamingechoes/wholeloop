import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flagReadPlan, remoteFlagHost } from '../providers/flag-bridge.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'

export async function flagReadCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (
    positional.length ||
    typeof options['--bridge'] !== 'string' ||
    typeof options['--flag'] !== 'string' ||
    typeof options['--environment'] !== 'string'
  )
    throw new CliError(
      'Use provider read-flags --bridge <file> --flag <key> --environment <key> [--live]',
    )
  let config: unknown
  try {
    const file = resolve(root, options['--bridge']),
      stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error()
    const bytes = readFileSync(file)
    if (bytes.length > 65536) throw new Error()
    config = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new CliError(
      'Provide one regular non-secret bridge JSON file under 64 KiB; contents omitted',
    )
  }
  const plan = flagReadPlan(config, options['--flag'], options['--environment'])
  if (options['--live'] !== true) {
    io.out(JSON.stringify(plan, null, json ? undefined : 2))
    return 0
  }
  const host = remoteFlagHost(config, { secret: (name) => process.env[name] })
  const result = await host.invoke({
    provider: plan.provider,
    operation: 'flags.read-state',
    tool: 'wholeloop.flags.read-state',
    args: { flag: plan.flag, environment: plan.environment },
    guidance: '',
  })
  io.out(
    JSON.stringify(
      {
        ...plan,
        status: 'observed',
        observedAt: new Date().toISOString(),
        effects: 'remote-read',
        result,
      },
      null,
      json ? undefined : 2,
    ),
  )
  return 0
}
