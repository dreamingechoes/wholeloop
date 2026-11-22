// A warm per-workspace container that runs a supervised step's project commands (ADR-0257).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { dockerCliEnvironment } from '../environment/docker-command.js'
import { canonicalPath } from '../state/paths.js'

export class DockerUnavailableError extends Error {}
export interface DockerReply {
  code: number | null
  stdout: string
  stderr: string
}
export type DockerCall = (args: string[], timeoutMs?: number) => DockerReply
export interface ProjectSandbox {
  container: string
  image: string
  imageId: string
  workspace: string
}

/**
 * The Docker CLI resolves its own context and credentials; wl never reads Docker's configuration
 * files (ADR-0245). Only the CLI's connection variables reach it through the caller's environment.
 */
export const dockerCli: DockerCall = (args, timeoutMs = 60_000) => {
  const result = spawnSync('docker', args, {
    env: dockerEnvironment(),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT')
    return { code: null, stdout: '', stderr: 'docker executable not found' }
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** The CLI gets PATH, HOME and its connection variables only, as the runner's does. */
export function dockerEnvironment(env: NodeJS.ProcessEnv = process.env) {
  try {
    return dockerCliEnvironment(env)
  } catch {
    throw new DockerUnavailableError(
      `Docker must be a local daemon reached through a Unix socket. ${DOCKER_REMEDY}`,
    )
  }
}

export const DOCKER_REMEDY =
  'Start Docker and run it again, or choose host execution for this run with --execution host (it then runs on this machine, not isolated).'

/** One cheap query before anything is planned: a reachable Linux daemon, or a refusal. */
export function dockerPreflight(call: DockerCall = dockerCli) {
  const reply = call(['version', '--format', '{{.Server.Os}} {{.Server.Version}}'], 15_000)
  const [os, version = ''] = reply.stdout.trim().split(' ')
  if (reply.code !== 0 || os !== 'linux')
    throw new DockerUnavailableError(`Docker is not reachable. ${DOCKER_REMEDY}`)
  if (!(Number(version.split('.')[0]) >= 28))
    throw new DockerUnavailableError(
      `Docker ${version || 'of an unknown version'} is older than the required 28. ${DOCKER_REMEDY}`,
    )
}

/** Cache only: pulling would fetch from a registry without the person asking for it. */
export function resolveImage(image: string, call: DockerCall = dockerCli) {
  const reply = call(['image', 'inspect', '--format', '{{.Id}}', image], 15_000)
  const id = reply.stdout.trim()
  if (reply.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(id))
    throw new DockerUnavailableError(
      `Image ${image} is not available locally. Pull it yourself with docker pull ${image}, or choose host execution for this run with --execution host.`,
    )
  return id
}

const LABEL = 'wholeloop.exec'
export function sandboxName(workspace: string) {
  return `wl-exec-${createHash('sha256').update(canonicalPath(workspace)).digest('hex').slice(0, 16)}`
}

/**
 * Reuse the running container for this workspace and image, so a build loop does not pay a
 * container start per command. A container under the same name that wholeloop did not create is
 * never touched; one created for another image is replaced.
 */
export function ensureSandbox(
  workspace: string,
  image: string,
  call: DockerCall = dockerCli,
): ProjectSandbox {
  const source = canonicalPath(workspace)
  // --mount is comma-separated and has no escape the CLI documents for every version.
  if (/[,"\n\r]/.test(source))
    throw new DockerUnavailableError(
      'This workspace path contains a comma, quote or newline, which Docker cannot mount safely; move the worktree or choose --execution host.',
    )
  dockerPreflight(call)
  const imageId = resolveImage(image, call)
  const container = sandboxName(source)
  const inspected = call(
    [
      'container',
      'inspect',
      '--format',
      `{{index .Config.Labels "${LABEL}"}} {{index .Config.Labels "wholeloop.image"}} {{.State.Running}}`,
      container,
    ],
    15_000,
  )
  if (inspected.code === 0) {
    const [owned, ownedImage, running] = inspected.stdout.trim().split(' ')
    if (owned !== '1')
      throw new DockerUnavailableError(
        `A container named ${container} exists but was not created by wholeloop; remove or rename it.`,
      )
    if (ownedImage === imageId) {
      if (running !== 'true' && call(['container', 'start', container]).code !== 0)
        throw new DockerUnavailableError(`Could not restart the project container ${container}.`)
      return { container, image, imageId, workspace: source }
    }
    if (call(['container', 'rm', '--force', container]).code !== 0)
      throw new DockerUnavailableError(`Could not replace the project container ${container}.`)
  }
  const user =
    typeof process.getuid === 'function' && typeof process.getgid === 'function'
      ? ['--user', `${process.getuid()}:${process.getgid()}`]
      : []
  const created = call(
    [
      'container',
      'run',
      '--detach',
      '--name',
      container,
      '--label',
      `${LABEL}=1`,
      '--label',
      `wholeloop.image=${imageId}`,
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '512',
      '--memory',
      '4g',
      '--cpus',
      '2',
      ...user,
      '--tmpfs',
      '/tmp',
      '--env',
      'HOME=/tmp',
      '--mount',
      `type=bind,source=${source},target=/workspace`,
      '--workdir',
      '/workspace',
      '--entrypoint',
      'sleep',
      imageId,
      'infinity',
    ],
    60_000,
  )
  if (created.code !== 0)
    throw new DockerUnavailableError(
      `Could not start a project container from ${image}; it needs a sleep executable.`,
    )
  return { container, image, imageId, workspace: source }
}

/** A command's directory relative to its workspace, never above or outside it. */
export function projectCwd(cwd: string) {
  const relative = posix.normalize(cwd.split('\\').join('/') || '.')
  if (relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative))
    throw new Error('Project commands run inside their workspace')
  return relative
}

/** The argv that runs one project command inside the sandbox, with the caller's relative cwd. */
export function sandboxArgv(sandbox: ProjectSandbox, cwd: string, argv: readonly string[]) {
  const relative = projectCwd(cwd)
  return [
    'docker',
    'exec',
    '--workdir',
    posix.join('/workspace', relative),
    sandbox.container,
    ...argv,
  ]
}

/** A timed-out command keeps running inside the container unless the container stops. */
export function stopSandbox(workspace: string, call: DockerCall = dockerCli) {
  const container = sandboxName(workspace)
  const inspected = call(
    ['container', 'inspect', '--format', `{{index .Config.Labels "${LABEL}"}}`, container],
    15_000,
  )
  if (inspected.code !== 0) return false
  if (inspected.stdout.trim() !== '1')
    throw new DockerUnavailableError(
      `A container named ${container} exists but was not created by wholeloop; it was left alone.`,
    )
  return call(['container', 'rm', '--force', container]).code === 0
}
