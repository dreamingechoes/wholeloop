// Splits argv into positional arguments and options for every command.
import { CliError } from './errors.js'

export function parseArguments(
  args: readonly string[],
  flags: readonly string[] = [],
  values: readonly string[] = [],
): { positional: string[]; options: Record<string, string | true> } {
  const positional: string[] = []
  const options: Record<string, string | true> = {}
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? ''
    if (arg === '--') {
      positional.push(...args.slice(index + 1))
      break
    }
    if (!arg.startsWith('-')) {
      positional.push(arg)
      continue
    }
    const equals = arg.indexOf('=')
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (Object.hasOwn(options, name)) throw new CliError(`Duplicate option: ${name}`)
    if (flags.includes(name)) {
      if (equals !== -1) throw new CliError(`Option ${name} does not take a value`)
      options[name] = true
    } else if (values.includes(name)) {
      const value = equals === -1 ? args[++index] : arg.slice(equals + 1)
      if (!value || value.startsWith('--')) throw new CliError(`Option ${name} needs a value`)
      options[name] = value
    } else throw new CliError(`Unknown option '${name}'`)
  }
  return { positional, options }
}
