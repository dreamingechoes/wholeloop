// A warm per-workspace container that runs a supervised step's project commands (ADR-0257).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join, posix } from 'node:path'
import { dockerCliEnvironment } from '../environment/docker-command.js'
import { canonicalPath, storePath } from '../state/paths.js'
import type { ProjectSetup } from './choice.js'

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
  /** The declared setup and whether it ran, with network, when this container was created. */
  setup?: { argv: string[]; ran: boolean }
}
/** A dependency install is allowed far longer than one inspection call. */
export const SETUP_TIMEOUT_MS = 15 * 60 * 1000

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
const setupLabel = (setup?: ProjectSetup) =>
  setup ? createHash('sha256').update(JSON.stringify(setup)).digest('hex').slice(0, 16) : 'none'
/** Installed dependencies live in the store, never in the worktree the person can open (ADR-0260). */
export function dependencyCache(workspace: string, store = storePath()) {
  return join(store, 'execution', sandboxName(workspace))
}
// --mount is comma-separated and has no escape the CLI documents for every version.
const mountable = (path: string) => !/[,"\n\r]/.test(path)

/**
 * Reuse the running container for this workspace and image, so a build loop does not pay a
 * container start per command. A container under the same name that wholeloop did not create is
 * never touched; one created for another image is replaced.
 */
export function ensureSandbox(
  workspace: string,
  image: string,
  call: DockerCall = dockerCli,
  options: { setup?: ProjectSetup; store?: string } = {},
): ProjectSandbox {
  const source = canonicalPath(workspace)
  const setup = options.setup
  const cache = setup ? dependencyCache(source, options.store) : undefined
  if (!mountable(source) || (cache && !mountable(cache)))
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
      `{{index .Config.Labels "${LABEL}"}} {{index .Config.Labels "wholeloop.image"}} {{.State.Running}} {{index .Config.Labels "wholeloop.setup"}} {{range $name, $value := .NetworkSettings.Networks}}{{$name}} {{end}}`,
      container,
    ],
    15_000,
  )
  if (inspected.code === 0) {
    const [owned, ownedImage, running, ownedSetup = '', ...networks] = inspected.stdout
      .trim()
      .split(/\s+/)
    if (owned !== '1')
      throw new DockerUnavailableError(
        `A container named ${container} exists but was not created by wholeloop; remove or rename it.`,
      )
    // A reused container must still be offline: setup's network is detached before any command.
    const offline = networks.every((name) => name === 'none')
    if (ownedImage === imageId && (ownedSetup || 'none') === setupLabel(setup) && offline) {
      if (running !== 'true' && call(['container', 'start', container]).code !== 0)
        throw new DockerUnavailableError(`Could not restart the project container ${container}.`)
      return {
        container,
        image,
        imageId,
        workspace: source,
        ...(setup ? { setup: { argv: setup.argv, ran: false } } : {}),
      }
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
      '--label',
      `wholeloop.setup=${setupLabel(setup)}`,
      // Only a declared setup starts on a network, and it is detached before any other command.
      '--network',
      setup ? 'bridge' : 'none',
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
      ...(setup && cache
        ? [
            '--mount',
            `type=bind,source=${prepared(cache)},target=${posix.join('/workspace', setup.dependencies)}`,
          ]
        : []),
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
  if (!setup) return { container, image, imageId, workspace: source }
  const fail = (message: string): never => {
    call(['container', 'rm', '--force', container])
    throw new DockerUnavailableError(message)
  }
  const ran = call(['exec', '--workdir', '/workspace', container, ...setup.argv], SETUP_TIMEOUT_MS)
  if (ran.code !== 0)
    fail(
      `Setup ${setup.argv.join(' ')} failed in the project container${ran.stderr.trim() ? `: ${ran.stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`,
    )
  // Every later command must run offline; a container that cannot prove it is removed.
  const detached = call(['network', 'disconnect', 'bridge', container], 30_000)
  const left = call(
    [
      'container',
      'inspect',
      '--format',
      '{{range $name, $value := .NetworkSettings.Networks}}{{$name}} {{end}}',
      container,
    ],
    15_000,
  )
  if (detached.code !== 0 || left.code !== 0 || left.stdout.trim() !== '')
    fail(`Could not take the project container ${container} offline after setup; it was removed.`)
  return { container, image, imageId, workspace: source, setup: { argv: setup.argv, ran: true } }
}

/** A store directory the person owns, so the container's own user can write dependencies there. */
function prepared(cache: string) {
  mkdirSync(cache, { recursive: true, mode: 0o700 })
  return cache
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
export function stopSandbox(workspace: string, call: DockerCall = dockerCli, store = storePath()) {
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
  const removed = call(['container', 'rm', '--force', container]).code === 0
  // Installed dependencies belong to that container; the next one runs its setup again.
  if (removed) rmSync(dependencyCache(workspace, store), { recursive: true, force: true })
  return removed
}
