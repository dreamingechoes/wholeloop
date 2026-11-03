import { fileURLToPath } from 'node:url'
import { deliveryForegroundChild, deliveryReconcileChild } from '../cli/delivery-runner.js'
import { EXIT } from '../cli/io.js'
import { RECONCILE_ARGUMENT } from './controller-bundle.js'
import { FOREGROUND_ARGUMENT } from './foreground-owner.js'
import { composePublicHost } from './public-composition.js'

// The installed controller bundle (ADR-0205). It runs only as the owned
// foreground child; its own path and digest are what the parent published.
const mode = process.argv.length === 3 ? process.argv[2] : undefined
process.exitCode =
  mode === FOREGROUND_ARGUMENT
    ? await deliveryForegroundChild(fileURLToPath(import.meta.url), composePublicHost)
    : mode === RECONCILE_ARGUMENT
      ? await deliveryReconcileChild(composePublicHost)
      : EXIT.input
