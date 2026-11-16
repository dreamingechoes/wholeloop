// Reads the client's reported MCP tool inventory from one bounded regular file.
import { resolve } from 'node:path'
import { readRegularText } from '../fs/regular-file.js'
import { type ClientMcpInventory, clientMcpInventory } from '../providers/transport.js'
import { CliError } from './errors.js'

/**
 * Read the client's reported MCP tool inventory from one regular file.
 *
 * The inventory is metadata the client supplies about its own connection: it
 * authenticates nothing and grants no authority. Symlinks and oversized files
 * are refused, and a malformed file never echoes its contents.
 */
export function readClientInventory(root: string, path: string): ClientMcpInventory {
  try {
    const file = resolve(root, path)
    const text = readRegularText(file, 65536)
    if (text === undefined) throw new Error()
    return clientMcpInventory(JSON.parse(text))
  } catch {
    throw new CliError(
      'Use one regular non-secret client MCP inventory file under 64 KiB; contents omitted',
    )
  }
}
