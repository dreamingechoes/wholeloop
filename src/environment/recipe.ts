// The environment recipe format: files, commands, mounts, services and limits.
import { realpathSync, statSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { checkDependencies } from '../slices/contract.js'
import { inside } from '../state/paths.js'
import schema from './schemas/recipe-v1.json' with { type: 'json' }

export const ENVIRONMENT_RECIPE_SCHEMA = schema
export const DEFAULT_ENVIRONMENT_LIMITS = {
  setupMs: 300_000,
  readinessMs: 120_000,
  services: 8,
  memoryMiB: 8192,
  cpus: 4,
  outputBytes: 1024 * 1024,
}
export interface EnvironmentFile {
  id: string
  repository: string
  ref: string
  sha256: string
  kind: 'package' | 'script' | 'guidance' | 'tool' | 'fixture'
}
export interface EnvironmentCommand {
  argv: string[]
  cwd: string
  origin: { kind: 'recipe' | 'image' | 'file' | 'package-script'; file?: string; script?: string }
}
export interface EnvironmentMount {
  kind: 'workspace' | 'data' | 'input'
  source: string
  target: string
  access: 'read' | 'write'
}
export interface EnvironmentService {
  id: string
  image: string
  acquisition: 'cache-only' | 'explicit-pull'
  after: string[]
  mounts: EnvironmentMount[]
  start: EnvironmentCommand
  readiness: {
    kind: 'tcp' | 'exec'
    timeoutMs: number
    port?: number
    command?: EnvironmentCommand
  }
  ports: { container: number; publish: 'none' | 'loopback' }[]
  memoryMiB: number
  cpus: number
  secrets: { name: string; provider: 'stdin' | 'os-keyring' | 'native-store'; ref: string }[]
}
export interface EnvironmentRecipe {
  schema: 'wholeloop/environment-recipe@1'
  backend: {
    id: 'docker'
    os: 'linux'
    architecture: 'arm64' | 'amd64'
    emulation: 'forbid' | 'allow'
  }
  repositories: { id: string; root: string }[]
  files: EnvironmentFile[]
  data: string[]
  services: EnvironmentService[]
  commands: {
    id: string
    service: string
    phase: 'setup' | 'seed' | 'test'
    command: EnvironmentCommand
    timeoutMs: number
  }[]
  network: {
    setup: 'none' | 'internal' | 'scoped'
    runtime: 'none' | 'internal' | 'scoped'
    destinations: string[]
  }
  limits: typeof DEFAULT_ENVIRONMENT_LIMITS
  retention: {
    failure: 'keep'
    success: 'keep' | 'retire'
    reviewAfterMs: number
    expiryAction: 'retain'
  }
}
export class EnvironmentRecipeError extends Error {
  constructor(readonly problem: string) {
    super(`Environment recipe refused: ${problem}; contents omitted`)
  }
}
export function environmentPackage(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    // JSON.parse accepts duplicate script keys. Reject ambiguous selected origins before pinning.
    if (!isObject(value) || parseDocument(text, { uniqueKeys: true }).errors.length)
      throw new Error()
    return value
  } catch {
    throw new EnvironmentRecipeError('invalid-or-ambiguous-package')
  }
}

function refuse(problem: string): never {
  throw new EnvironmentRecipeError(problem)
}
function unique(values: (string | number)[], problem: string) {
  if (new Set(values).size !== values.length) refuse(problem)
}
/** Sources may be relative; host mounts may not. Only backend-allocated logical roots are mountable. */
export function environmentRelativeFile(ref: string): boolean {
  return (
    !!ref &&
    !ref.includes('\\') &&
    !/[\r\n\0]/.test(ref) &&
    !posix.isAbsolute(ref) &&
    ref.split('/').every((part) => part !== '..' && part !== '.' && part !== '.git' && !!part)
  )
}
function containerPath(path: string): boolean {
  return (
    path.startsWith('/') &&
    path === posix.normalize(path) &&
    !/[\\\r\n\0]/.test(path) &&
    !path.split('/').includes('.git')
  )
}
function within(root: string, path: string) {
  return root === path || path.startsWith(`${root}/`)
}

/** These checks are structural. A prepared recipe cannot attest backend capacity or readiness. */
export function validateEnvironmentRecipe(value: unknown): EnvironmentRecipe {
  try {
    validateDeliveryShape(value, schema)
  } catch {
    refuse('invalid-shape-or-secret')
  }
  const recipe = structuredClone(value) as EnvironmentRecipe
  for (const [values, problem] of [
    [recipe.repositories.map((entry) => entry.id), 'duplicate-repository'],
    [recipe.repositories.map((entry) => entry.root), 'duplicate-repository'],
    [recipe.files.map((entry) => entry.id), 'duplicate-file'],
    [recipe.files.map((entry) => `${entry.repository}:${entry.ref}`), 'ambiguous-file-origin'],
    [recipe.services.map((entry) => entry.id), 'duplicate-service'],
    [recipe.commands.map((entry) => entry.id), 'duplicate-command'],
    [recipe.data, 'duplicate-data'],
    [recipe.network.destinations, 'duplicate-destination'],
  ] as const)
    unique([...values], problem)
  for (const repository of recipe.repositories) {
    if (
      !repository.root.startsWith('/') ||
      resolve(repository.root) !== repository.root ||
      /[\r\n\0]/.test(repository.root)
    )
      refuse('noncanonical-source-root')
    for (const other of recipe.repositories)
      if (other !== repository && inside(repository.root, other.root))
        refuse('overlapping-source-roots')
  }
  for (const file of recipe.files)
    if (
      !environmentRelativeFile(file.ref) ||
      !recipe.repositories.some((repo) => repo.id === file.repository)
    )
      refuse('unsafe-file-origin')
  if (
    recipe.services.length > recipe.limits.services ||
    recipe.services.reduce((n, service) => n + service.memoryMiB, 0) > recipe.limits.memoryMiB ||
    recipe.services.reduce((n, service) => n + service.cpus, 0) > recipe.limits.cpus
  )
    refuse('capacity-plan')
  if (
    (recipe.network.setup === 'scoped' || recipe.network.runtime === 'scoped') !==
    !!recipe.network.destinations.length
  )
    refuse('network-destinations')
  for (const destination of recipe.network.destinations) {
    const [host, port] = destination.split(':')
    if (
      !host ||
      host.includes('..') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      Number(port) > 65535 ||
      ['localhost', 'host.docker.internal', 'gateway.docker.internal'].includes(host) ||
      /^\d+(?:\.\d+)*$/.test(host)
    )
      refuse('unsafe-network-destination')
  }
  for (const service of recipe.services) {
    unique(service.after, 'duplicate-service-dependency')
    if (service.after.some((id) => !recipe.services.some((entry) => entry.id === id)))
      refuse('unknown-service-dependency')
    unique(
      service.ports.map((port) => port.container),
      'duplicate-service-port',
    )
    unique(
      service.mounts.map((mount) => mount.target),
      'overlapping-mount',
    )
    unique(
      service.secrets.map((secret) => secret.name),
      'duplicate-secret-reference',
    )
    for (const secret of service.secrets)
      if (secret.ref.split('/').some((part) => !part || part === '..' || part === '.'))
        refuse('unsafe-secret-reference')
    for (const mount of service.mounts) {
      const prefix =
        mount.kind === 'workspace' ? 'workspace' : mount.kind === 'data' ? 'data' : 'inputs'
      if (
        mount.target !== `/${prefix}/${mount.source}` ||
        (mount.kind === 'input' && mount.access !== 'read')
      )
        refuse('unsafe-mount')
      if (
        mount.kind === 'workspace' &&
        !recipe.repositories.some((repo) => repo.id === mount.source)
      )
        refuse('unknown-workspace')
      if (mount.kind === 'data' && !recipe.data.includes(mount.source)) refuse('unknown-data')
      if (mount.kind === 'input' && !recipe.files.some((file) => file.id === mount.source))
        refuse('unknown-input')
    }
    validateCommand(recipe, service, service.start, true)
    const ready = service.readiness
    if (ready.timeoutMs > recipe.limits.readinessMs) refuse('unbounded-readiness')
    if (ready.kind === 'tcp') {
      if (
        ready.command !== undefined ||
        ready.port === undefined ||
        !service.ports.some((port) => port.container === ready.port)
      )
        refuse('invalid-readiness')
    } else {
      if (ready.port !== undefined || !ready.command) refuse('invalid-readiness')
      validateCommand(recipe, service, ready.command, false)
    }
  }
  try {
    checkDependencies(new Map(recipe.services.map((service) => [service.id, service.after])))
  } catch {
    refuse('service-cycle')
  }
  for (const step of recipe.commands) {
    const service = recipe.services.find((entry) => entry.id === step.service)
    if (!service) refuse('unknown-command-service')
    if (step.timeoutMs > recipe.limits.setupMs) refuse('unbounded-command')
    validateCommand(recipe, service, step.command, false)
    if (
      step.phase === 'seed' &&
      !service.mounts.some((mount) => mount.kind === 'data' && mount.access === 'write')
    )
      refuse('seed-without-owned-data')
  }
  return recipe
}
function validateCommand(
  recipe: EnvironmentRecipe,
  service: EnvironmentService,
  command: EnvironmentCommand,
  start: boolean,
) {
  if (
    !containerPath(command.cwd) ||
    !['/tmp', ...service.mounts.map((mount) => mount.target)].some((root) =>
      within(root, command.cwd),
    )
  )
    refuse('unsafe-command-directory')
  if (
    command.argv.some(
      (arg) =>
        /[\r\n\0]/.test(arg) ||
        /^(?:--?)(?:password|secret|token|api[-_]?key|authorization)(?:=|$)/i.test(arg),
    )
  )
    refuse('unsafe-command-argument')
  if (command.origin.kind === 'image') {
    if (!start || command.argv.length || command.origin.file || command.origin.script)
      refuse('ambiguous-command-origin')
    return
  }
  if (!command.argv[0]?.trim() || command.argv[0].startsWith('-')) refuse('empty-command')
  if (command.origin.kind === 'recipe') {
    if (command.origin.file || command.origin.script) refuse('ambiguous-command-origin')
    return
  }
  const file = recipe.files.find((file) => file.id === command.origin.file)
  if (!file) refuse('missing-command-origin')
  const workspace = service.mounts.find(
    (mount) => mount.kind === 'workspace' && mount.source === file.repository,
  )
  const input = service.mounts.find((mount) => mount.kind === 'input' && mount.source === file.id)
  const path = workspace ? `${workspace.target}/${file.ref}` : input?.target
  const inputFile = input ? `${input.target}/${posix.basename(file.ref)}` : undefined
  if (!path) refuse('unmounted-command-origin')
  if (command.origin.kind === 'package-script') {
    if (
      file.kind !== 'package' ||
      posix.basename(file.ref) !== 'package.json' ||
      !command.origin.script ||
      !workspace ||
      command.cwd !== posix.dirname(path) ||
      contractDigest(command.argv) !== contractDigest(['npm', 'run', command.origin.script])
    )
      refuse('ambiguous-package-command')
  } else if (
    command.origin.script ||
    !['script', 'tool'].includes(file.kind) ||
    (!command.argv.includes(path) && !(inputFile && command.argv.includes(inputFile)))
  )
    refuse('ambiguous-file-command')
}

/** Read bytes only after pure validation. No Git, package manager, shell, image pull or hook runs. */
export function observeEnvironmentFiles(recipe: EnvironmentRecipe) {
  for (const repo of recipe.repositories) {
    try {
      if (realpathSync(repo.root) !== repo.root || !statSync(repo.root).isDirectory())
        refuse('noncanonical-source-root')
    } catch {
      refuse('unavailable-source-root')
    }
  }
  return recipe.files.map((file) => {
    const repo = recipe.repositories.find((repo) => repo.id === file.repository)
    if (!repo) refuse('unsafe-file-origin')
    let text: string
    try {
      text = readSourceFile(repo.root, file.ref)
    } catch {
      refuse('unavailable-or-unsafe-file')
    }
    if (sourceHash(text) !== file.sha256) refuse('changed-source-file')
    if (file.kind === 'package') {
      let value: unknown
      try {
        value = environmentPackage(text)
      } catch {
        refuse('invalid-package-origin')
      }
      for (const command of [
        ...recipe.services.map((service) => service.start),
        ...recipe.services.flatMap((service) =>
          service.readiness.command ? [service.readiness.command] : [],
        ),
        ...recipe.commands.map((step) => step.command),
      ]) {
        if (command.origin.kind !== 'package-script' || command.origin.file !== file.id) continue
        if (
          !isObject(value) ||
          !isObject(value.scripts) ||
          typeof value.scripts[command.origin.script ?? ''] !== 'string' ||
          !(value.scripts[command.origin.script ?? ''] as string).trim()
        )
          refuse('missing-package-script')
      }
    }
    return { ...file, bytes: Buffer.byteLength(text) }
  })
}
