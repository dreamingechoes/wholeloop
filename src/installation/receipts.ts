import { lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { artifactDigest } from '../adapters/generate.js'
import { isObject } from '../config/schema.js'
import { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import { type Component, type OwnedFile, type Pending, type Receipt, TARGETS } from './contracts.js'
import { exists } from './files.js'
import { type InstallContext, installLocations } from './plan.js'

export function installationScope(input: InstallContext) {
  const context = {
    ...input,
    root: canonicalPath(input.root),
    home: canonicalPath(input.home),
    store: canonicalPath(input.store),
  }
  const identity = context.scope === 'user' ? context.home : context.root
  if (identity === dirname(identity) || !lstatSync(identity).isDirectory())
    throw new Error('Use an existing home/project directory, never a filesystem root')
  const store = new StoreFiles(context.store)
  const key = artifactDigest(`${context.scope}\0${identity}`).slice(0, 24)
  const control = new StoreFiles(store.path(`installations/${key}`))
  const artifact = (target: string) =>
    context.scope === 'project'
      ? join(context.root, '.wholeloop/distribution', target)
      : store.path(`distributions/${key}/${target}`)
  const receiptPath = 'receipt.json'
  return { context, identity, store, key, control, artifact, receiptPath }
}

export function allowed(file: OwnedFile, component: Component, context: InstallContext) {
  if (file.component !== component.target || canonicalPath(file.path) !== file.path) return false
  if (context.scope === 'project' && !inside(context.root, file.path)) return false
  if (inside(component.artifact, file.path)) return true
  if (
    component.target === 'antigravity' &&
    context.scope === 'user' &&
    component.locations.plugin &&
    file.path === join(component.locations.plugin, 'plugin.json')
  )
    return true
  const skill = file.path.slice(component.locations.skills.length + 1)
  if (
    inside(component.locations.skills, file.path) &&
    /^wl-[a-z0-9]+(?:-[a-z0-9]+)*\/(?:SKILL\.md|scripts\/wl\.mjs)$/.test(skill)
  )
    return true
  const agent = file.path.slice(component.locations.agents.length + 1)
  if (
    inside(component.locations.agents, file.path) &&
    /^wl-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:md|toml|agent\.md)$/.test(agent)
  )
    return true
  return (
    !!component.locations.hooks &&
    file.path ===
      join(
        component.locations.hooks,
        component.target === 'opencode'
          ? 'wholeloop.js'
          : component.target === 'antigravity'
            ? 'hooks.json'
            : 'wholeloop.json',
      )
  )
}
export function readReceipt(
  store: StoreFiles,
  path: string,
  context: InstallContext,
  identity: string,
  artifact: (target: string) => string,
): Receipt {
  if (!exists(store.path(path)))
    return {
      schema: 'wholeloop/install-receipt@1',
      identity,
      scope: context.scope,
      components: [],
      directories: [],
    }
  const stat = lstatSync(store.path(path))
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
    throw new Error('Unsafe installation receipt; preserve it for recovery')
  const value: unknown = JSON.parse(store.read(path) ?? '')
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/install-receipt@1' ||
    value.identity !== identity ||
    value.scope !== context.scope ||
    !Array.isArray(value.components) ||
    !Array.isArray(value.directories) ||
    value.directories.some((path) => typeof path !== 'string') ||
    Object.keys(value).some(
      (key) =>
        !['schema', 'identity', 'scope', 'components', 'directories', 'pending'].includes(key),
    )
  )
    throw new Error('Invalid installation receipt; preserve it for recovery')
  function component(value: unknown): Component {
    if (
      !isObject(value) ||
      typeof value.target !== 'string' ||
      !TARGETS.includes(value.target as (typeof TARGETS)[number]) ||
      value.artifact !== artifact(value.target) ||
      !Array.isArray(value.files) ||
      typeof value.source !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.source) ||
      typeof value.core !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.core) ||
      typeof value.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version) ||
      JSON.stringify(value.locations) !== JSON.stringify(installLocations(value.target, context)) ||
      Object.keys(value).some(
        (key) =>
          !['target', 'artifact', 'files', 'source', 'core', 'version', 'locations'].includes(key),
      )
    )
      throw new Error(
        'Installation identity or configured native roots changed; preserve the receipt and restore its original context',
      )
    const result: Component = {
      target: value.target,
      artifact: String(value.artifact),
      files: [],
      source: value.source,
      core: value.core,
      version: value.version,
      locations: installLocations(value.target, context),
    }
    result.files = value.files.map((entry) => {
      if (
        !isObject(entry) ||
        typeof entry.path !== 'string' ||
        typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        ![0o644, 0o755].includes(Number(entry.mode)) ||
        entry.component !== result.target ||
        Object.keys(entry).some((key) => !['path', 'sha256', 'mode', 'component'].includes(key))
      )
        throw new Error('Invalid owned installation file')
      const file: OwnedFile = {
        path: entry.path,
        sha256: entry.sha256,
        mode: Number(entry.mode) as 0o644 | 0o755,
        component: result.target,
      }
      if (!allowed(file, result, context))
        throw new Error('Owned installation path escapes its native scope')
      return file
    })
    if (new Set(result.files.map((file) => file.path)).size !== result.files.length)
      throw new Error('Duplicate owned installation files')
    return result
  }
  const components = value.components.map(component)
  if (new Set(components.map((entry) => entry.target)).size !== components.length)
    throw new Error('Duplicate installed components')
  let pending: Pending | undefined
  if (value.pending !== undefined) {
    const data = value.pending
    if (
      !isObject(data) ||
      !['install', 'uninstall'].includes(String(data.kind)) ||
      !Array.isArray(data.targets) ||
      !data.targets.length ||
      data.targets.some(
        (target) =>
          typeof target !== 'string' || !TARGETS.includes(target as (typeof TARGETS)[number]),
      ) ||
      new Set(data.targets).size !== data.targets.length ||
      !Array.isArray(data.before) ||
      !Array.isArray(data.after) ||
      typeof data.backup !== 'string' ||
      !/^backups\/[a-f0-9-]+$/.test(data.backup) ||
      Object.keys(data).some(
        (key) => !['kind', 'targets', 'before', 'after', 'backup'].includes(key),
      )
    )
      throw new Error('Invalid pending installation; preserve it for recovery')
    pending = {
      kind: data.kind as Pending['kind'],
      targets: data.targets as string[],
      before: data.before.map(component),
      after: data.after.map(component),
      backup: data.backup,
    }
    if (
      [...pending.before, ...pending.after].some(
        (entry) => !pending?.targets.includes(entry.target),
      )
    )
      throw new Error('Pending installation components do not match their targets')
  }
  const known = [...components, ...(pending?.before ?? []), ...(pending?.after ?? [])].flatMap(
    (entry) => entry.files,
  )
  const directories = [...new Set(value.directories as string[])]
  if (
    directories.some(
      (path) =>
        canonicalPath(path) !== path ||
        path === dirname(path) ||
        path === context.root ||
        path === context.home ||
        !known.some((file) => inside(path, file.path)),
    )
  )
    throw new Error('Invalid installation directory ownership')
  return {
    schema: 'wholeloop/install-receipt@1',
    identity,
    scope: context.scope,
    components,
    directories,
    ...(pending ? { pending } : {}),
  }
}
export function sameComponent(a: Component, b: Component | undefined) {
  const files = new Map(b?.files.map((file) => [file.path, file]))
  return (
    !!b &&
    a.target === b.target &&
    a.artifact === b.artifact &&
    a.source === b.source &&
    a.core === b.core &&
    a.version === b.version &&
    JSON.stringify(a.locations) === JSON.stringify(b.locations) &&
    a.files.length === b.files.length &&
    a.files.every((file) => {
      const previous = files.get(file.path)
      return (
        previous &&
        file.path === previous.path &&
        file.sha256 === previous.sha256 &&
        file.mode === previous.mode &&
        file.component === previous.component
      )
    })
  )
}

export function saveReceipt(store: StoreFiles, path: string, receipt: Receipt) {
  const content = `${JSON.stringify(receipt, null, 2)}\n`
  if (Buffer.byteLength(content) > 1024 * 1024)
    throw new Error(
      'Installation ownership metadata exceeds its bounded receipt budget; preserve the pending installation and inspect its component plan',
    )
  store.atomic(path, content)
}
