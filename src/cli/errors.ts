// The CLI error type, carrying the exit code a failure maps to.
import { EXIT } from './io.js'

export class CliError extends Error {
  constructor(
    message: string,
    readonly code: number = EXIT.shape,
  ) {
    super(message)
  }
}
