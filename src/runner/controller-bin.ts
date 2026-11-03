import { fileURLToPath } from 'node:url'
import { deliveryForegroundChild } from '../cli/delivery-runner.js'
import { EXIT } from '../cli/io.js'
import { FOREGROUND_ARGUMENT } from './foreground-owner.js'
import { composePublicHost } from './public-composition.js'

// The installed controller bundle (ADR-0205). It runs only as the owned
// foreground child; its own path and digest are what the parent published.
process.exitCode =
  process.argv[2] === FOREGROUND_ARGUMENT && process.argv.length === 3
    ? await deliveryForegroundChild(fileURLToPath(import.meta.url), composePublicHost)
    : EXIT.input
