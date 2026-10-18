import { EXIT } from './io.js'

export class CliError extends Error {
  constructor(
    message: string,
    readonly code: number = EXIT.shape,
  ) {
    super(message)
  }
}
