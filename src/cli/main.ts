import { VERSION } from '../version.js'
import { parseArguments } from './arguments.js'
import { COMMANDS } from './commands.js'
import { commitCheck } from './commit.js'
import { configCommand } from './config.js'
import { docsCheck, docsNav } from './docs.js'
import { CliError } from './errors.js'
import { flowCommand } from './flow.js'
import { harnessCheck } from './harness.js'
import { EXIT, type Io } from './io.js'
import { mailboxCommand } from './mailbox.js'
import { profileCommand } from './profile.js'
import { stateCommand } from './state.js'

export { EXIT, type Io } from './io.js'

function usage(): string {
  return `wholeloop ${VERSION} — a CLI-agnostic AI development harness

Usage: wl <command> [options]

Options:
  -v, --version   Print the version
  -h, --help      Print this help
  --json         Print a versioned JSON payload

Commands:
${COMMANDS.map((command) => `  ${`${command.path} ${command.arguments}`.trim().padEnd(30)} ${command.summary}`).join('\n')}`
}

export function run(argv: readonly string[], io: Io, root = process.cwd()): number {
  const json = argv.includes('--json')
  const args = argv.filter((arg) => arg !== '--json')
  try {
    if (args.length === 1 && ['--version', '-v'].includes(args[0] ?? '')) {
      io.out(json ? JSON.stringify({ schema: 'wholeloop/version@1', version: VERSION }) : VERSION)
      return EXIT.ok
    }
    if (!args.length || args.includes('--help') || args.includes('-h')) {
      io.out(
        json
          ? JSON.stringify({ schema: 'wholeloop/help@1', version: VERSION, commands: COMMANDS })
          : usage(),
      )
      return EXIT.ok
    }
    const command = COMMANDS.find(
      (candidate) => args.slice(0, candidate.path.split(' ').length).join(' ') === candidate.path,
    )
    if (!command)
      throw new CliError(
        `unknown command or option '${args.join(' ')}'. Run 'wl --help'.`,
        EXIT.unexpected,
      )
    const rest = args.slice(command.path.split(' ').length)
    const parsed = parseArguments(
      rest,
      command.options.filter((option) => !option.includes(' ')),
      command.options
        .filter((option) => option.includes(' '))
        .map((option) => option.split(' ')[0] ?? option),
    )
    if (!command.arguments && parsed.positional.length)
      throw new CliError(`Unexpected argument for ${command.path}`)
    if (command.path.startsWith('profile '))
      return profileCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('step ') || command.path === 'answer')
      return flowCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('msg ') || ['handoff', 'resume'].includes(command.path))
      return mailboxCommand(command.path, parsed, json, io)
    if (command.path.startsWith('state ') || ['note', 'link', 'open'].includes(command.path))
      return stateCommand(command.path, parsed, json, io)
    switch (command.path) {
      case 'config show':
      case 'config schema':
        return configCommand(command.path.split(' ')[1] ?? '', parsed, root, json, io)
      case 'docs nav':
        return docsNav(root, json, io)
      case 'docs check':
        return docsCheck(root, json, io)
      case 'harness check':
        return harnessCheck(root, json, io)
      case 'guard commit-msg':
        if (parsed.positional.length > 1) throw new CliError('Expected one commit message file')
        return commitCheck(parsed.positional[0], json, io)
      default:
        throw new Error(`No handler registered for ${command.path}`)
    }
  } catch (error) {
    const code = error instanceof CliError ? error.code : EXIT.unexpected
    const message = error instanceof Error ? error.message : String(error)
    if (json) io.out(JSON.stringify({ schema: 'wholeloop/error@1', code, message }))
    else io.err(`wl: ${message}`)
    return code
  }
}
