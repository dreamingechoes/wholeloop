// `wl discover` and `wl resolve`: repository guidance discovery and slot resolution.
import { homedir } from 'node:os'
import { loadConfig } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function discoveryCommand(
  command: string,
  { positional }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length !== (command === 'discover' ? 0 : 1))
    throw new CliError(
      `Expected ${command === 'discover' ? 'no argument' : 'one slot'} for ${command}`,
      EXIT.input,
    )
  try {
    const inventory = discover(root, new StateStore().files, homedir())
    if (command === 'discover') {
      io.out(
        JSON.stringify(
          {
            ...inventory.repo,
            fingerprint: inventory.fingerprint,
            cached: inventory.cached,
            user: inventory.user,
            warnings: inventory.warnings,
          },
          null,
          json ? undefined : 2,
        ),
      )
      return inventory.repo.problems.length || inventory.user.problems.length ? EXIT.shape : EXIT.ok
    }
    const config = loadConfig({ root }).values
    const slot = positional[0] ?? ''
    const binding =
      isObject(config.slots) && typeof config.slots[slot] === 'string'
        ? config.slots[slot]
        : undefined
    const payload = resolveSlot(slot, inventory.repo, {
      user: inventory.user,
      ...(binding ? { binding } : {}),
    })
    io.out(JSON.stringify(payload, null, json ? undefined : 2))
    return payload.questions.length ? EXIT.input : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : String(error))
  }
}
