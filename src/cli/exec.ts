// `wl exec`: runs a builder's project command in its slice's warm container (ADR-0257).
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { BuildWorkflow } from '../build/workflow.js'
import { chosenImage, executionChoice, NOT_ISOLATED } from '../execution/choice.js'
import {
  DockerUnavailableError,
  dockerEnvironment,
  ensureSandbox,
  projectCwd,
  sandboxArgv,
  stopSandbox,
} from '../execution/docker.js'
import { FlowEngine } from '../flow/engine.js'
import { canonicalPath } from '../state/paths.js'
import { StateStore } from '../state/store.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

const OUTPUT_BYTES = 1024 * 1024

/** The slice's own worktree when it has one, otherwise the checkout it is built in. */
function workspaceFor(engine: FlowEngine, subject: string) {
  const allocation = worktreeRecords(engine.store.events()).find(
    (entry) => entry.subject === subject && entry.status === 'active',
  )
  return canonicalPath(allocation?.path ?? new BuildWorkflow(engine).engineFor(subject).root)
}

export function execCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const subject = typeof options['--for'] === 'string' ? options['--for'] : undefined
  if (!subject) throw new CliError('Provide --for <slice> and the command after --')
  const engine = new FlowEngine(new StateStore(), root)
  const workspace = workspaceFor(engine, subject)
  // Choices live in the repository the suite reads them from, not in an uncommitted worktree copy.
  const repository = new BuildWorkflow(engine).engineFor(subject)
  try {
    if (options['--stop'] === true) {
      if (positional.length) throw new CliError('--stop takes no command')
      const removed = stopSandbox(workspace)
      const payload = { schema: 'wholeloop/exec@1', subject, stopped: removed }
      io.out(
        json
          ? JSON.stringify(payload)
          : removed
            ? 'Project container removed.'
            : 'No project container was running.',
      )
      return EXIT.ok
    }
    if (!positional.length) throw new CliError('Provide the project command after --')
    const timeout = Number(options['--timeout'] ?? 600_000)
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 3_600_000)
      throw new CliError('--timeout must be between 1000 and 3600000 milliseconds')
    const cwd = projectCwd(typeof options['--cwd'] === 'string' ? options['--cwd'] : '.')
    // Workers cannot pick the host for themselves: only the repository's recorded choice applies.
    const choice = executionChoice(repository.root)
    let argv = positional
    let image: { image: string; imageId: string } | undefined
    if (choice.isolation === 'docker') {
      const name = chosenImage(repository.configuration().values.answers)
      if (!name)
        throw new DockerUnavailableError(
          "Choose the container image that runs this repository's code: wl setup --image <name> --scope project, or ask the person to choose host execution for this repository.",
        )
      const sandbox = ensureSandbox(workspace, name)
      image = { image: sandbox.image, imageId: sandbox.imageId }
      argv = sandboxArgv(sandbox, cwd, positional)
    }
    const result = spawnSync(argv[0] ?? '', argv.slice(1), {
      cwd: choice.isolation === 'host' ? join(workspace, cwd) : workspace,
      // Host commands keep the person's environment, as their own shell would; the Docker
      // CLI gets only its connection variables and forwards nothing into the container.
      ...(choice.isolation === 'docker' ? { env: dockerEnvironment() } : {}),
      timeout,
      maxBuffer: OUTPUT_BYTES,
      encoding: 'utf8',
      stdio: json ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    })
    if (result.signal && choice.isolation === 'docker') stopSandbox(workspace)
    const placement =
      choice.isolation === 'docker'
        ? `Ran in a Docker container (${image?.image}).`
        : `Ran on this machine, not isolated (${choice.source === 'repository' ? 'chosen for this repository' : 'chosen'}).`
    if (json)
      io.out(
        JSON.stringify({
          schema: 'wholeloop/exec@1',
          subject,
          isolation: choice.isolation,
          source: choice.source,
          ...(image ?? { note: NOT_ISOLATED }),
          exitCode: result.status,
          signal: result.signal,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        }),
      )
    else (io.progress ?? io.err)(placement)
    if (result.error && !result.signal)
      throw new CliError(
        `Project command could not start: ${result.error.message}`,
        EXIT.precondition,
      )
    return result.status ?? 1
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Project command failed',
      EXIT.precondition,
    )
  }
}
