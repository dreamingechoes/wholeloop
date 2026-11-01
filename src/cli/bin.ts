import { fileURLToPath } from 'node:url'
import { FOREGROUND_ARGUMENT } from '../runner/foreground-owner.js'
import { deliveryForegroundChild } from './delivery-runner.js'
import { runAsync } from './main.js'

// The owned controller child never parses ordinary commands or arguments.
process.exitCode =
  process.argv[2] === FOREGROUND_ARGUMENT
    ? await deliveryForegroundChild(fileURLToPath(import.meta.url))
    : await runAsync(process.argv.slice(2), {
        out: (text) => process.stdout.write(`${text}\n`),
        err: (text) => process.stderr.write(`${text}\n`),
      })
