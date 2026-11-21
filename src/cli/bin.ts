// The `wl` executable: routes to the CLI, or to the owned controller child, which never parses
// ordinary commands.
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { FOREGROUND_ARGUMENT } from '../runner/foreground-owner.js'
import { withClientAttribution } from '../state/attribution-context.js'
import { adapterInvocation } from './adapter-context.js'
import { packagedContext } from './adapter-root.js'
import { deliveryForegroundChild } from './delivery-runner.js'
import { runAsync } from './main.js'

// The owned controller child never parses ordinary commands or arguments.
let outputCancelled = false
const packaged =
  process.argv[2] === FOREGROUND_ARGUMENT
    ? undefined
    : packagedContext(fileURLToPath(import.meta.url), process.argv[1])
const code =
  process.argv[2] === FOREGROUND_ARGUMENT
    ? await deliveryForegroundChild(fileURLToPath(import.meta.url))
    : await adapterInvocation(
        process.argv.slice(2),
        {
          out: (text) => process.stdout.write(`${text}\n`),
          err: (text) => process.stderr.write(`${text}\n`),
          flush: async (signal) => {
            if (process.stdout.writableNeedDrain) await once(process.stdout, 'drain', { signal })
          },
          cancelOutput: () => {
            outputCancelled = true
          },
        },
        packaged,
        (args, io) =>
          withClientAttribution(
            packaged ? { client: packaged.target, source: 'declared' } : undefined,
            () => runAsync(args, io),
          ),
      )

// Node stdio deliberately refuses destruction. A cancelled watch can otherwise
// retain a blocked pipe forever. Finish reader cleanup, then discard only this
// interrupted output; consumers resume from their last complete NDJSON frame.
if (outputCancelled) process.exit(code)
process.exitCode = code
