// Writes a rendered adapter tree with the same ownership rules as release exports.
import type { generateAdapter } from './generate.js'
import { writeOwnedArtifacts } from './owned-output.js'

/** Adapter builds and release exports share ownership and preservation rules. */
export function writeAdapter(
  output: string,
  generated: ReturnType<typeof generateAdapter>,
  dryRun = false,
) {
  return writeOwnedArtifacts(output, generated, dryRun)
}
