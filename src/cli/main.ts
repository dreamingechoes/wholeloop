import { VERSION } from '../version.js'
import { adapterRoot } from './adapter-root.js'
import { parseArguments } from './arguments.js'
import { buildCommand } from './build.js'
import { challengeCommand } from './challenge.js'
import { COMMANDS } from './commands.js'
import { commitCheck } from './commit.js'
import { configCommand } from './config.js'
import { conformanceCommand } from './conformance.js'
import { discoveryCommand } from './discovery.js'
import { docsCheck, docsNav } from './docs.js'
import { doctorCommand } from './doctor.js'
import { environmentCommand } from './environment.js'
import { CliError } from './errors.js'
import { evalCommand, gateEvalCommand } from './eval.js'
import { extensionCommand } from './extensions.js'
import { fanoutCommand } from './fanout.js'
import { flowCommand } from './flow.js'
import { gateCommand } from './gate.js'
import { generateCommand } from './generate.js'
import { groundingCommand } from './grounding.js'
import { guardCommand } from './guard.js'
import { harnessCheck } from './harness.js'
import { impactCommand } from './impact.js'
import { installationCommand } from './install.js'
import { EXIT, type Io } from './io.js'
import { launchCommand } from './launch.js'
import { learningCommand } from './learning.js'
import { mailboxCommand } from './mailbox.js'
import { profileCommand } from './profile.js'
import { providerCommand } from './provider.js'
import { providerFixtureCommand } from './provider-test.js'
import { pullRequestCommand } from './pull-requests.js'
import { rampCommand } from './ramp.js'
import { researchCommand } from './research.js'
import { reviewCommand } from './review.js'
import { scopesCommand } from './scopes.js'
import { sharingCommand } from './sharing.js'
import { slicesCommand } from './slices.js'
import { specCommand } from './spec.js'
import { stateCommand } from './state.js'
import { syncCommand } from './sync.js'
import { utilityCommand } from './utilities.js'
import { verificationCommand, verificationSuiteCommand } from './verification.js'
import { worktreeCommand } from './worktree.js'

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
    if (command.path.startsWith('learn '))
      return learningCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('launch '))
      return launchCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('env '))
      return environmentCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('review '))
      return reviewCommand(command.path, parsed, root, json, io)
    if (['verify begin', 'verify complete'].includes(command.path))
      return verificationCommand(command.path, parsed, root, json, io)
    if (
      (command.path.startsWith('guard ') && command.path !== 'guard commit-msg') ||
      command.path === 'fanout run' ||
      command.path.startsWith('conformance ') ||
      command.path === 'adopt' ||
      command.path.startsWith('share ') ||
      command.path === 'eval grounding' ||
      command.path === 'sync' ||
      command.path === 'provider test' ||
      command.path === 'verify suite' ||
      command.path.startsWith('pr ') ||
      command.path.startsWith('ramp ') ||
      command.path.startsWith('measure ')
    )
      throw new CliError('This command requires the asynchronous dispatcher')
    if (command.path === 'install' || command.path === 'uninstall')
      return installationCommand(command.path, parsed, root, json, io)
    if (command.path === 'doctor') return doctorCommand(parsed, root, json, io)
    if (command.path === 'adapter root') return adapterRoot(json, io)
    if (command.path === 'build') return generateCommand(parsed, root, json, io)
    if (command.path.startsWith('build ')) return buildCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('gate ')) return gateCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('worktree '))
      return worktreeCommand(command.path, parsed, root, json, io)
    if (command.path === 'eval gates') return gateEvalCommand(parsed, json, io)
    if (command.path === 'eval definitions') return evalCommand(parsed, json, io)
    if (command.path.startsWith('challenge '))
      return challengeCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('slices '))
      return slicesCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('scopes '))
      return scopesCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('spec ')) return specCommand(command.path, parsed, json, io)
    if (command.path.startsWith('research '))
      return researchCommand(command.path, parsed, root, json, io)
    if (['next', 'status', 'setup'].includes(command.path))
      return utilityCommand(command.path, parsed, root, json, io)
    if (/^(template|lens) |^profile (list|test|scaffold)$/.test(command.path))
      return extensionCommand(command.path, parsed, root, json, io)
    if (command.path.startsWith('provider ') || command.path === 'mcp add')
      return providerCommand(command.path, parsed, root, json, io)
    if (['discover', 'resolve'].includes(command.path))
      return discoveryCommand(command.path, parsed, root, json, io)
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

/** Preserve the synchronous programmatic router while the binary awaits process work. */
export async function runAsync(
  argv: readonly string[],
  io: Io,
  root = process.cwd(),
): Promise<number> {
  const args = argv.filter((arg) => arg !== '--json')
  const command = COMMANDS.find(
    (command) =>
      ((command.path.startsWith('guard ') && command.path !== 'guard commit-msg') ||
        command.path === 'fanout run' ||
        command.path.startsWith('conformance ') ||
        command.path === 'adopt' ||
        command.path.startsWith('share ') ||
        command.path === 'eval grounding' ||
        command.path === 'sync' ||
        command.path === 'provider test' ||
        command.path === 'verify suite' ||
        command.path.startsWith('pr ') ||
        command.path.startsWith('ramp ') ||
        command.path.startsWith('measure ')) &&
      args.slice(0, command.path.split(' ').length).join(' ') === command.path,
  )
  if (
    !command ||
    args.slice(0, command.path.split(' ').length).join(' ') !== command.path ||
    args.some((arg) => ['--help', '-h'].includes(arg))
  )
    return run(argv, io, root)
  const json = argv.includes('--json')
  try {
    const parsed = parseArguments(
      args.slice(command.path.split(' ').length),
      command.options.filter((option) => !option.includes(' ')),
      command.options
        .filter((option) => option.includes(' '))
        .map((option) => option.split(' ')[0] ?? option),
    )
    if (command.path.startsWith('guard '))
      return await guardCommand(command.path, parsed, root, json, io)
    if (command.path === 'fanout run') return await fanoutCommand(parsed, root, json, io)
    if (command.path.startsWith('conformance '))
      return await conformanceCommand(command.path, parsed, root, json, io)
    if (command.path === 'adopt' || command.path.startsWith('share '))
      return await sharingCommand(command.path, parsed, root, json, io)
    return command.path === 'eval grounding'
      ? await groundingCommand(parsed, json, io)
      : command.path === 'sync'
        ? await syncCommand(parsed, root, json, io)
        : command.path === 'provider test'
          ? await providerFixtureCommand(parsed, root, json, io)
          : command.path.startsWith('measure ')
            ? await impactCommand(command.path, parsed, root, json, io)
            : command.path.startsWith('ramp ')
              ? await rampCommand(command.path, parsed, root, json, io)
              : command.path.startsWith('pr ')
                ? await pullRequestCommand(command.path, parsed, root, json, io)
                : await verificationSuiteCommand(parsed, root, json, io)
  } catch (error) {
    const code = error instanceof CliError ? error.code : EXIT.precondition
    const message = error instanceof Error ? error.message : 'Asynchronous command failed'
    if (json) io.out(JSON.stringify({ schema: 'wholeloop/error@1', code, message }))
    else io.err(`wl: ${message}`)
    return code
  }
}
