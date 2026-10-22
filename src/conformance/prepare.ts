import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalDigest } from '../adapters/canonical.js'
import { artifactDigest } from '../adapters/generate.js'
import { openCodeMajor } from '../adapters/opencode-version.js'
import { isObject } from '../config/schema.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { manageInstallation } from '../installation/manage.js'
import { installedName, installLocations } from '../installation/plan.js'
import { StoreFiles } from '../state/files.js'
import {
  CONFORMANCE_ID,
  CONFORMANCE_TARGETS,
  type ConformanceContext,
  type PreparedConformance,
} from './contracts.js'
import { conformanceInput, conformancePrompt, conformanceRecipe } from './recipes.js'
import { conformanceScenario } from './scenario.js'

const pinPattern = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/
export const runFiles = (context: ConformanceContext, id: string) => {
  if (!CONFORMANCE_ID.test(id)) throw new Error('Invalid conformance run ID')
  const parent = new StoreFiles(context.store)
  return new StoreFiles(parent.path(`conformance/${id}`))
}
// The fixture is deliberate repository output; only control/state paths pass through StoreFiles.path.
const layout = (files: StoreFiles) => ({
  root: join(files.root, 'repository'),
  home: files.path('home'),
  state: files.path('home/state/wholeloop'),
})

export function markedCanonical(context: ConformanceContext, marker: string) {
  const canonical = new Map(context.canonical)
  const path = 'harness/skills/frame-problem/SKILL.md'
  const skill = canonical.get(path)
  if (!skill) throw new Error('The bundled framing skill is missing')
  canonical.set(
    path,
    `${skill}\nConformance fixture only: after begin and before complete, run\n\`wl note <initiative-id> "conformance-marker:${marker}" --json\`.\n`,
  )
  return canonical
}

/** No inherited Git hooks, templates, signing or identity run while seeding the disposable repository. */
function fixtureGit(root: string, hooks: string, args: string[]) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  )
  const result = spawnSync(
    'git',
    [
      '-c',
      `core.hooksPath=${hooks}`,
      '-c',
      'init.templateDir=',
      '-c',
      'commit.gpgSign=false',
      '-c',
      'user.name=Fixture Owner',
      '-c',
      'user.email=fixture@example.invalid',
      ...args,
    ],
    {
      cwd: root,
      env: {
        ...env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 65536,
    },
  )
  if (result.error || result.status !== 0)
    throw new Error('Conformance fixture Git preparation failed; diagnostics omitted')
}

export function prepareConformance(context: ConformanceContext, target: string, pin: string) {
  if (
    !CONFORMANCE_TARGETS.includes(target as (typeof CONFORMANCE_TARGETS)[number]) ||
    !pinPattern.test(pin)
  )
    throw new Error('Choose one conformance target and an exact semantic version pin')
  if (target === 'opencode') openCodeMajor(pin)
  const { scenario, digest } = conformanceScenario(context.canonical)
  const id = `cf-${randomBytes(12).toString('hex')}`
  const files = runFiles(context, id)
  const paths = layout(files)
  const marker = randomBytes(16).toString('hex')
  mkdirSync(paths.root, { recursive: true, mode: 0o700 })
  mkdirSync(paths.home, { recursive: true, mode: 0o700 })
  mkdirSync(files.path('empty-hooks'), { mode: 0o700 })
  writeFileSync(join(paths.root, 'README.md'), scenario.readme, { flag: 'wx', mode: 0o644 })
  fixtureGit(paths.root, files.path('empty-hooks'), ['init', '-b', 'conformance'])
  const installation = {
    ...paths,
    store: paths.state,
    scope: 'project' as const,
    env: {},
    ...(target === 'opencode' ? { opencodeVersion: pin } : {}),
  }
  manageInstallation('install', {
    context: installation,
    targets: [target],
    canonical: markedCanonical(context, marker),
    core: context.core,
    version: context.version,
  })
  fixtureGit(paths.root, files.path('empty-hooks'), ['add', '--force', '.'])
  fixtureGit(paths.root, files.path('empty-hooks'), [
    'commit',
    '-m',
    'test(conformance): seed standalone framing fixture',
    '-m',
    'Keep the synthetic baseline distinct from runtime state and client evidence.',
  ])
  const skill = join(
    installLocations(target, installation).skills,
    `${installedName(target, 'skill', 'frame-problem')}/SKILL.md`,
  )
  const run: PreparedConformance = {
    schema: 'wholeloop/conformance-run@1',
    id,
    target,
    pin,
    scenario: scenario.id,
    scenarioDigest: digest,
    source: canonicalDigest(context.canonical),
    core: artifactDigest(context.core),
    version: context.version,
    ...paths,
    marker,
    baseline: workspaceSnapshot(paths.root).digest,
    launcher: join(skill, '../scripts/wl.mjs'),
    skill,
    artifact: join(paths.state, 'framing-draft.md'),
    phase: 'prepared',
  }
  files.atomic('run.json', `${JSON.stringify(run)}\n`)
  files.atomic('prompt.txt', `${conformancePrompt(run, scenario)}\n`)
  files.atomic('input.txt', conformanceInput(run, scenario))
  return {
    schema: 'wholeloop/conformance-prepared@1',
    id,
    cli: target,
    pin,
    root: run.root,
    state: run.state,
    prompt: files.path('prompt.txt'),
    input: files.path('input.txt'),
    recipe: conformanceRecipe(run),
    evidence: 'unrun',
    limitations: ['Preparing files does not launch a client or prove native skill discovery.'],
  }
}

/** Derive all executable/data paths; metadata never supplies an arbitrary launch or journal destination. */
export function readConformance(context: ConformanceContext, id: string): PreparedConformance {
  const files = runFiles(context, id)
  const path = files.path('run.json')
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    throw new Error('Invalid conformance run metadata')
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error('Invalid conformance run metadata; contents omitted')
  }
  const paths = layout(files)
  const { scenario, digest } = conformanceScenario(context.canonical)
  const repository = lstatSync(paths.root)
  if (!repository.isDirectory() || repository.isSymbolicLink())
    throw new Error('Unsafe conformance fixture repository')
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/conformance-run@1' ||
    value.id !== id ||
    typeof value.target !== 'string' ||
    !CONFORMANCE_TARGETS.includes(value.target as (typeof CONFORMANCE_TARGETS)[number]) ||
    typeof value.pin !== 'string' ||
    !pinPattern.test(value.pin) ||
    typeof value.marker !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.marker) ||
    typeof value.baseline !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.baseline) ||
    !['prepared', 'running', 'finished'].includes(String(value.phase)) ||
    value.scenario !== scenario.id ||
    value.scenarioDigest !== digest ||
    value.source !== canonicalDigest(context.canonical) ||
    value.core !== artifactDigest(context.core) ||
    value.version !== context.version ||
    Object.entries(paths).some(([key, path]) => value[key] !== path)
  )
    throw new Error(
      'Conformance metadata is invalid or belongs to another source/core; prepare a new run',
    )
  const skill = join(
    installLocations(value.target, { ...paths, scope: 'project', store: paths.state, env: {} })
      .skills,
    `${installedName(value.target, 'skill', 'frame-problem')}/SKILL.md`,
  )
  if (
    value.skill !== skill ||
    value.launcher !== join(skill, '../scripts/wl.mjs') ||
    value.artifact !== join(paths.state, 'framing-draft.md') ||
    (value.phase === 'prepared'
      ? value.mode !== undefined || value.process !== undefined
      : !['fixture', 'live'].includes(String(value.mode)))
  )
    throw new Error('Invalid conformance paths or execution mode')
  if (
    value.process !== undefined &&
    (!isObject(value.process) ||
      !['succeeded', 'crashed', 'timeout', 'cancelled', 'overflow'].includes(
        String(value.process.status),
      ) ||
      !(value.process.code === null || Number.isInteger(value.process.code)) ||
      !(
        value.process.signal === null ||
        (typeof value.process.signal === 'string' && /^SIG[A-Z0-9]+$/.test(value.process.signal))
      ) ||
      (value.process.version !== undefined &&
        (typeof value.process.version !== 'string' || !pinPattern.test(value.process.version))))
  )
    throw new Error('Invalid conformance process metadata')
  if (
    value.problem !== undefined &&
    !['workspace-changed', 'version-unobserved', 'version-mismatch', 'process-failed'].includes(
      String(value.problem),
    )
  )
    throw new Error('Invalid conformance failure metadata')
  return value as unknown as PreparedConformance
}
