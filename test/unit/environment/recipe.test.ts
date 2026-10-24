import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { EnvironmentLedger } from '../../../src/environment/ledger.js'
import {
  DEFAULT_ENVIRONMENT_LIMITS,
  type EnvironmentRecipe,
  observeEnvironmentFiles,
  validateEnvironmentRecipe,
} from '../../../src/environment/recipe.js'
import { discoverEnvironment, EnvironmentRecipes } from '../../../src/environment/recipe-store.js'
import { StateStore } from '../../../src/state/store.js'
import { entry } from '../../support/delivery.js'

function fixture(
  run: (input: {
    dir: string
    root: string
    recipes: EnvironmentRecipes
    recipe: EnvironmentRecipe
    marker: string
  }) => void,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-environment-recipe-')))
  const root = join(dir, 'source with spaces')
  mkdirSync(root)
  const marker = join(dir, 'must-not-run')
  const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`
  const pack = JSON.stringify({
    scripts: { test: 'node health.cjs', postinstall: 'node health.cjs' },
  })
  writeFileSync(join(root, 'package.json'), pack)
  writeFileSync(join(root, 'health.cjs'), script)
  const recipe: EnvironmentRecipe = {
    schema: 'wholeloop/environment-recipe@1',
    backend: { id: 'docker', os: 'linux', architecture: 'arm64', emulation: 'forbid' },
    repositories: [{ id: 'app', root }],
    files: [
      {
        id: 'package',
        repository: 'app',
        ref: 'package.json',
        sha256: sourceHash(pack),
        kind: 'package',
      },
      {
        id: 'health',
        repository: 'app',
        ref: 'health.cjs',
        sha256: sourceHash(script),
        kind: 'script',
      },
    ],
    data: ['db'],
    services: [
      {
        id: 'web',
        image: `docker.io/library/node@sha256:${'a'.repeat(64)}`,
        acquisition: 'cache-only',
        after: [],
        mounts: [
          { kind: 'workspace', source: 'app', target: '/workspace/app', access: 'read' },
          { kind: 'data', source: 'db', target: '/data/db', access: 'write' },
        ],
        start: {
          argv: ['node', '/workspace/app/health.cjs'],
          cwd: '/workspace/app',
          origin: { kind: 'file', file: 'health' },
        },
        readiness: { kind: 'tcp', port: 3000, timeoutMs: 1000 },
        ports: [{ container: 3000, publish: 'loopback' }],
        memoryMiB: 128,
        cpus: 1,
        secrets: [],
      },
    ],
    commands: [
      {
        id: 'test',
        service: 'web',
        phase: 'test',
        timeoutMs: 1000,
        command: {
          argv: ['npm', 'run', 'test'],
          cwd: '/workspace/app',
          origin: { kind: 'package-script', file: 'package', script: 'test' },
        },
      },
    ],
    network: { setup: 'none', runtime: 'none', destinations: [] },
    limits: { ...DEFAULT_ENVIRONMENT_LIMITS },
    retention: {
      failure: 'keep',
      success: 'keep',
      reviewAfterMs: 86400000,
      expiryAction: 'retain',
    },
  }
  try {
    run({ dir, root, recipe, marker, recipes: new EnvironmentRecipes(join(dir, 'store')) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const web = (recipe: EnvironmentRecipe) => entry(recipe.services, 0)
const file = (recipe: EnvironmentRecipe) => entry(recipe.files, 0)
const step = (recipe: EnvironmentRecipe) => entry(recipe.commands, 0)

describe('inert environment planning', () => {
  it('discovers scripts without execution and pins exact source/tool bytes outside the repository', () =>
    fixture(({ root, recipes, recipe, marker }) => {
      const discovered = discoverEnvironment(root, ['package.json', 'health.cjs'])
      expect(discovered).toMatchObject({
        executed: false,
        authority: 'not-granted',
        defaults: { setupMs: 300000, readinessMs: 120000, services: 8, memoryMiB: 8192, cpus: 4 },
      })
      expect(discovered.candidates[0]?.scripts).toEqual(['postinstall', 'test'])
      const prepared = recipes.prepare(recipe)
      expect(prepared.digest).toBe(contractDigest(recipe))
      expect(prepared).toMatchObject({
        executed: false,
        readiness: 'not-observed',
        authority: 'not-granted',
      })
      expect(new EnvironmentRecipes(recipes.files.root).prepare(recipe)).toEqual(prepared)
      expect(recipes.inspect(prepared.digest).inputs).toBe('current')
      for (const selected of prepared.files)
        expect(
          readFileSync(
            recipes.files.path(`delivery/environment-inputs/${selected.sha256}.txt`),
            'utf8',
          ),
        ).toBe(readFileSync(join(root, selected.ref), 'utf8'))
      expect(existsSync(marker)).toBe(false)
      expect(existsSync(join(root, '.wholeloop'))).toBe(false)
    }))
  it('keeps historic recipes and bytes readable while changed inputs cannot reuse readiness', () =>
    fixture(({ root, recipes, recipe }) => {
      const original = recipes.prepare(recipe)
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { test: 'node changed.cjs' } }),
      )
      expect(recipes.get(original.digest)).toEqual(original)
      expect(recipes.inspect(original.digest)).toMatchObject({
        inputs: 'changed-or-unavailable',
        readiness: 'not-observed',
      })
      expect(() => recipes.prepare(recipe)).toThrow('changed-source-file')
      file(recipe).sha256 = sourceHash(readFileSync(join(root, 'package.json'), 'utf8'))
      expect(recipes.prepare(recipe).digest).not.toBe(original.digest)
      expect(recipes.get(original.digest)).toEqual(original)
    }))
  it('rejects corrupted immutable manifests and selected blob bytes', () =>
    fixture(({ recipes, recipe }) => {
      const original = recipes.prepare(recipe)
      const path = recipes.files.path(`delivery/environment-recipes/${original.digest}.json`)
      const value = JSON.parse(readFileSync(path, 'utf8'))
      value.recipe.retention.success = 'retire'
      writeFileSync(path, JSON.stringify(value))
      expect(() => recipes.get(original.digest)).toThrow('damaged-recipe-identity')
      value.recipe = recipe
      writeFileSync(path, JSON.stringify(value))
      writeFileSync(
        recipes.files.path(`delivery/environment-inputs/${file(recipe).sha256}.txt`),
        '{}',
      )
      expect(() => recipes.get(original.digest)).toThrow('damaged-selected-input')
    }))
  it('refuses duplicate JSON script keys and missing selected scripts without running hooks', () =>
    fixture(({ root, recipe, marker }) => {
      const text = '{"scripts":{"test":"first","test":"second"}}'
      writeFileSync(join(root, 'package.json'), text)
      file(recipe).sha256 = sourceHash(text)
      expect(() => discoverEnvironment(root)).toThrow('ambiguous-package')
      expect(() => observeEnvironmentFiles(recipe)).toThrow('invalid-package-origin')
      writeFileSync(join(root, 'package.json'), '{"scripts":{"other":"node health.cjs"}}')
      file(recipe).sha256 = sourceHash(readFileSync(join(root, 'package.json'), 'utf8'))
      expect(() => observeEnvironmentFiles(recipe)).toThrow('missing-package-script')
      expect(existsSync(marker)).toBe(false)
    }))
  it('refuses source symlinks, traversal, oversized files and aliased repository roots', () =>
    fixture(({ dir, root, recipe, recipes }) => {
      writeFileSync(join(dir, 'outside.txt'), 'Outside boundary.')
      symlinkSync(join(dir, 'outside.txt'), join(root, 'link.txt'))
      file(recipe).ref = 'link.txt'
      expect(() => recipes.prepare(recipe)).toThrow()
      file(recipe).ref = '../outside.txt'
      expect(() => recipes.prepare(recipe)).toThrow('unsafe-file-origin')
      file(recipe).ref = 'package.json'
      writeFileSync(join(root, 'package.json'), 'x'.repeat(1024 * 1024 + 1))
      expect(() => recipes.prepare(recipe)).toThrow('unavailable-or-unsafe-file')
      const alias = join(dir, 'alias')
      symlinkSync(root, alias)
      entry(recipe.repositories, 0).root = alias
      expect(() => recipes.prepare(recipe)).toThrow('source-root')
    }))
  it('keeps old undo declarations byte-identical and unexecuted', () =>
    fixture(({ root, recipes, recipe, marker }) => {
      const store = new StateStore(recipes.files.root)
      const item = store.create({
        kind: 'slice',
        title: 'Fixture',
        owner: 'Owner',
        body: '',
        repository: root,
      })
      const ledger = new EnvironmentLedger(store)
      ledger.declare(item.id, {
        key: 'fixture',
        resource: 'fixture:data',
        effect: 'Declared only',
        by: 'Owner',
        undo: { cwd: root, argv: ['node', 'health.cjs'] },
      })
      const before = store.events()
      recipes.prepare(recipe)
      expect(store.events()).toEqual(before)
      expect(ledger.report(item.id).executed).toBe(false)
      expect(existsSync(marker)).toBe(false)
    }))
  it('supports explicit literal image commands, image defaults, scoped network and reference-only secrets', () =>
    fixture(({ recipe }) => {
      const service = web(recipe)
      service.start = { argv: [], cwd: '/data/db', origin: { kind: 'image' } }
      service.readiness = {
        kind: 'exec',
        timeoutMs: 1000,
        command: {
          argv: ['node', '-e', 'process.exit(0)'],
          cwd: '/tmp',
          origin: { kind: 'recipe' },
        },
      }
      service.secrets = [{ name: 'FIXTURE_AUTH', provider: 'os-keyring', ref: 'service/fixture' }]
      recipe.network = {
        setup: 'scoped',
        runtime: 'internal',
        destinations: ['registry.npmjs.org:443'],
      }
      expect(validateEnvironmentRecipe(recipe)).toEqual(recipe)
    }))
})

const refusals: [string, (recipe: EnvironmentRecipe) => void][] = [
  [
    'wrong package filename',
    (recipe) => {
      file(recipe).ref = 'other.json'
    },
  ],
  [
    'mutable image tag',
    (recipe) => {
      web(recipe).image = 'node:latest'
    },
  ],
  [
    'unknown field',
    (recipe) => {
      Object.assign(web(recipe), { privileged: true })
    },
  ],
  [
    'duplicate service',
    (recipe) => {
      recipe.services.push(structuredClone(web(recipe)))
    },
  ],
  [
    'dependency cycle',
    (recipe) => {
      web(recipe).after = ['web']
    },
  ],
  [
    'unknown dependency',
    (recipe) => {
      web(recipe).after = ['missing']
    },
  ],
  [
    'host-root mount',
    (recipe) => {
      entry(web(recipe).mounts, 0).target = '/'
    },
  ],
  [
    'controller-store mount',
    (recipe) => {
      Object.assign(entry(web(recipe).mounts, 0), { source: '/private/controller' })
    },
  ],
  [
    'docker socket',
    (recipe) => {
      entry(web(recipe).mounts, 0).target = '/var/run/docker.sock'
    },
  ],
  [
    'sibling workspace',
    (recipe) => {
      entry(web(recipe).mounts, 0).source = 'sibling'
    },
  ],
  [
    'writeable input',
    (recipe) => {
      web(recipe).mounts.push({
        kind: 'input',
        source: 'health',
        target: '/inputs/health',
        access: 'write',
      })
    },
  ],
  [
    'duplicate mount',
    (recipe) => {
      web(recipe).mounts.push(structuredClone(entry(web(recipe).mounts, 0)))
    },
  ],
  [
    'unsafe cwd',
    (recipe) => {
      web(recipe).start.cwd = '/etc'
    },
  ],
  [
    'ambiguous package origin',
    (recipe) => {
      step(recipe).command.argv.push('--force')
    },
  ],
  [
    'unmounted file origin',
    (recipe) => {
      web(recipe).mounts = []
    },
  ],
  [
    'ambiguous literal origin',
    (recipe) => {
      web(recipe).start.origin = { kind: 'recipe', file: 'health' }
    },
  ],
  [
    'missing explicit origin',
    (recipe) => {
      Reflect.deleteProperty(web(recipe).start, 'origin')
    },
  ],
  [
    'unknown selected file',
    (recipe) => {
      web(recipe).start.origin.file = 'missing'
    },
  ],
  [
    'duplicate selected file',
    (recipe) => {
      recipe.files.push({ ...file(recipe), id: 'second' })
    },
  ],
  [
    'unbounded setup',
    (recipe) => {
      recipe.limits.setupMs = Number.POSITIVE_INFINITY
    },
  ],
  [
    'command exceeds deadline',
    (recipe) => {
      step(recipe).timeoutMs = recipe.limits.setupMs + 1
    },
  ],
  [
    'readiness exceeds deadline',
    (recipe) => {
      web(recipe).readiness.timeoutMs = recipe.limits.readinessMs + 1
    },
  ],
  [
    'unowned readiness port',
    (recipe) => {
      web(recipe).readiness.port = 3999
    },
  ],
  [
    'mixed readiness',
    (recipe) => {
      web(recipe).readiness.command = web(recipe).start
    },
  ],
  [
    'capacity excess',
    (recipe) => {
      web(recipe).memoryMiB = recipe.limits.memoryMiB + 1
    },
  ],
  [
    'undeclared egress',
    (recipe) => {
      recipe.network.destinations = ['example.test:443']
    },
  ],
  [
    'unscoped egress',
    (recipe) => {
      recipe.network.setup = 'scoped'
    },
  ],
  [
    'host gateway',
    (recipe) => {
      recipe.network = {
        setup: 'scoped',
        runtime: 'none',
        destinations: ['host.docker.internal:80'],
      }
    },
  ],
  [
    'credential argument',
    (recipe) => {
      web(recipe).start.argv.push('--password', 'unused')
    },
  ],
  [
    'secret value field',
    (recipe) => {
      web(recipe).secrets.push({ name: 'FIXTURE_AUTH', provider: 'stdin', ref: 'fixture' })
      Object.assign(entry(web(recipe).secrets, 0), { value: 'not-a-real-value' })
    },
  ],
  [
    'secret reference traversal',
    (recipe) => {
      web(recipe).secrets = [{ name: 'FIXTURE_AUTH', provider: 'stdin', ref: '../fixture' }]
    },
  ],
  [
    'automatic expiry deletion',
    (recipe) => {
      Object.assign(recipe.retention, { expiryAction: 'delete' })
    },
  ],
]
it.each(refusals)('refuses %s before any execution', (_name, mutate) =>
  fixture(({ recipe, marker }) => {
    mutate(recipe)
    expect(() => validateEnvironmentRecipe(recipe)).toThrow()
    expect(existsSync(marker)).toBe(false)
  }),
)

it('uses independent compiled CLI discovery, preparation and stale inspection without backend invocation', () =>
  fixture(({ dir, root, recipe, marker }) => {
    writeFileSync(join(root, 'recipe.json'), JSON.stringify(recipe))
    const cli = (args: string[], status = 0) => {
      const result = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'delivery', ...args, '--json'],
        { encoding: 'utf8' },
      )
      expect(result.status, result.stderr || result.stdout).toBe(status)
      return JSON.parse(result.stdout)
    }
    expect(cli(['environment-schema'])).toMatchObject({
      schema: 'wholeloop/environment-schema@1',
      executed: false,
    })
    expect(cli(['environment-discover', '--root', root]).executed).toBe(false)
    const prepared = cli([
      'environment-plan',
      '--file',
      'recipe.json',
      '--root',
      root,
      '--store',
      join(dir, 'state'),
    ])
    expect(
      cli(['environment-inspect', '--digest', prepared.digest, '--store', join(dir, 'state')]),
    ).toMatchObject({ inputs: 'current', readiness: 'not-observed' })
    writeFileSync(join(root, 'health.cjs'), 'throw new Error("Changed fixture")')
    expect(
      cli(['environment-inspect', '--digest', prepared.digest, '--store', join(dir, 'state')])
        .inputs,
    ).toBe('changed-or-unavailable')
    expect(
      cli(
        [
          'environment-plan',
          '--file',
          'recipe.json',
          '--root',
          root,
          '--store',
          join(dir, 'state'),
        ],
        3,
      ).message,
    ).toBeDefined()
    expect(existsSync(marker)).toBe(false)
  }))
