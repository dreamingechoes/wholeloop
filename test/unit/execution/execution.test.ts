// Project code runs in Docker by default, host execution is explicit and recorded, and steps that
// only read never touch Docker (ADR-0257).
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stepDisplay } from '../../../src/display/step.js'
import {
  checkImage,
  checkSetup,
  chosenImage,
  executionChoice,
  proposedSetup,
  repositorySetup,
} from '../../../src/execution/choice.js'
import {
  type DockerCall,
  DockerUnavailableError,
  dependencyCache,
  dockerPreflight,
  ensureSandbox,
  projectCwd,
  resolveImage,
  sandboxArgv,
  sandboxName,
  stopSandbox,
} from '../../../src/execution/docker.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import { verificationRuns } from '../../../src/verification/state.js'
import { runSuite } from '../../../src/verification/suite.js'

const IMAGE_ID = `sha256:${'a'.repeat(64)}`
/** A scripted daemon: every call is logged and answered from a small state table. */
interface FakeContainer {
  image: string
  running: boolean
  owned?: boolean
  setup?: string
  networks?: string[]
}
function daemon(
  state: { container?: FakeContainer; setupFails?: boolean; disconnectFails?: boolean } = {},
) {
  const calls: string[][] = []
  const call: DockerCall = (args) => {
    calls.push(args)
    const [first, second] = args
    if (first === 'version') return { code: 0, stdout: 'linux 29.9.3\n', stderr: '' }
    if (first === 'image') return { code: 0, stdout: `${IMAGE_ID}\n`, stderr: '' }
    if (first === 'container' && second === 'inspect') {
      const container = state.container
      if (!container) return { code: 1, stdout: '', stderr: 'No such container' }
      const networks = (container.networks ?? ['none']).map((name) => `${name} `).join('')
      const format = args.at(-2) ?? ''
      return {
        code: 0,
        stdout: format.includes('wholeloop.image')
          ? `${container.owned === false ? '' : '1'} ${container.image} ${container.running} ${container.setup ?? 'none'} ${networks}\n`
          : format.startsWith('{{range')
            ? `${networks}\n`
            : `${container.owned === false ? '' : '1'}\n`,
        stderr: '',
      }
    }
    if (first === 'container' && second === 'run') {
      const flag = (name: string) => args[args.indexOf(name) + 1] ?? ''
      state.container = {
        image: IMAGE_ID,
        running: true,
        setup: flag('--label').startsWith('wholeloop.exec')
          ? (args.find((arg) => arg.startsWith('wholeloop.setup=')) ?? '').slice(16)
          : 'none',
        networks: [flag('--network')],
      }
      return { code: 0, stdout: 'id\n', stderr: '' }
    }
    if (first === 'exec')
      return state.setupFails
        ? { code: 1, stdout: '', stderr: 'npm error network unreachable' }
        : { code: 0, stdout: 'installed\n', stderr: '' }
    if (first === 'network' && second === 'disconnect') {
      if (state.disconnectFails) return { code: 1, stdout: '', stderr: 'cannot disconnect' }
      if (state.container) state.container.networks = []
      return { code: 0, stdout: '', stderr: '' }
    }
    if (first === 'container' && (second === 'start' || second === 'rm')) {
      if (second === 'rm') delete state.container
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  }
  return { call, calls, state }
}

describe('where project code runs', () => {
  it('defaults to Docker and takes host only from a run flag or the committed project file', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-choice-'))
    try {
      expect(executionChoice(root)).toEqual({ isolation: 'docker', source: 'default' })
      expect(executionChoice(root, 'host')).toEqual({ isolation: 'host', source: 'run' })
      expect(() => executionChoice(root, 'vm')).toThrow('--execution docker or host')
      mkdirSync(join(root, '.wholeloop'))
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        "version: 1\nanswers:\n  'execution:project-code': host\n",
      )
      expect(executionChoice(root)).toEqual({ isolation: 'host', source: 'repository' })
      expect(executionChoice(root, 'docker')).toEqual({ isolation: 'docker', source: 'run' })
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        "version: 1\nanswers:\n  'execution:project-code': sometimes\n",
      )
      expect(() => executionChoice(root)).toThrow('must be docker or host')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts image references only, from the run first and then remembered answers', () => {
    expect(checkImage('node:22-bookworm')).toBe('node:22-bookworm')
    expect(checkImage(`ghcr.io/acme/tool@${IMAGE_ID}`)).toContain('@sha256:')
    for (const bad of ['--privileged', 'two words', '', 'a;b'])
      expect(() => checkImage(bad)).toThrow()
    expect(chosenImage({ 'execution:image': 'python:3.13-slim' })).toBe('python:3.13-slim')
    expect(chosenImage({ 'execution:image': 'python:3.13-slim' }, 'node:22')).toBe('node:22')
    expect(chosenImage({})).toBeUndefined()
  })
})

describe('the project container', () => {
  it('starts one contained container per workspace and reuses it while it lives', () => {
    const { call, calls, state } = daemon()
    const workspace = mkdtempSync(join(tmpdir(), 'wholeloop-sandbox-'))
    try {
      const sandbox = ensureSandbox(workspace, 'node:fixture', call)
      expect(sandbox).toMatchObject({ container: sandboxName(workspace), imageId: IMAGE_ID })
      const run = calls.find((args) => args[0] === 'container' && args[1] === 'run') ?? []
      const flag = (name: string) => run[run.indexOf(name) + 1]
      expect(flag('--network')).toBe('none')
      expect(flag('--cap-drop')).toBe('ALL')
      expect(flag('--security-opt')).toBe('no-new-privileges')
      expect(flag('--mount')).toBe(`type=bind,source=${realpathSync(workspace)},target=/workspace`)
      expect(run.filter((arg) => arg === '--env')).toHaveLength(1)
      expect(run.join(' ')).not.toMatch(/docker\.sock|--privileged|--network host|-v \//)
      expect(calls.some((args) => args.includes('pull'))).toBe(false)
      const before = calls.length
      ensureSandbox(workspace, 'node:fixture', call)
      expect(calls.slice(before).some((args) => args[1] === 'run')).toBe(false)
      if (state.container) state.container.running = false
      ensureSandbox(workspace, 'node:fixture', call)
      expect(calls.at(-1)?.slice(0, 2)).toEqual(['container', 'start'])
      if (state.container) state.container.image = `sha256:${'b'.repeat(64)}`
      ensureSandbox(workspace, 'node:fixture', call)
      expect(calls.some((args) => args[1] === 'rm')).toBe(true)
      expect(sandboxArgv(sandbox, 'packages/api', ['npm', 'test'])).toEqual([
        'docker',
        'exec',
        '--workdir',
        '/workspace/packages/api',
        sandbox.container,
        'npm',
        'test',
      ])
      expect(() => projectCwd('../outside')).toThrow('inside their workspace')
      expect(() => projectCwd('/etc')).toThrow('inside their workspace')
      expect(stopSandbox(workspace, call)).toBe(true)
      expect(stopSandbox(workspace, call)).toBe(false)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('refuses unreachable daemons, missing images and containers it does not own, naming remedies', () => {
    const down: DockerCall = () => ({ code: 1, stdout: '', stderr: 'Cannot connect' })
    expect(() => dockerPreflight(down)).toThrow(/Start Docker.*--execution host/)
    const old: DockerCall = () => ({ code: 0, stdout: 'linux 27.5.1\n', stderr: '' })
    expect(() => dockerPreflight(old)).toThrow('older than the required 28')
    expect(() => resolveImage('node:missing', down)).toThrow(
      /docker pull node:missing.*--execution host/,
    )
    const foreign = daemon({ container: { image: IMAGE_ID, running: true, owned: false } })
    const workspace = mkdtempSync(join(tmpdir(), 'wholeloop-sandbox-'))
    try {
      expect(() => ensureSandbox(workspace, 'node:fixture', foreign.call)).toThrow(
        'was not created by wholeloop',
      )
      expect(() => stopSandbox(workspace, foreign.call)).toThrow('was left alone')
      expect(foreign.calls.some((args) => args[1] === 'rm')).toBe(false)
      const comma = join(workspace, 'a,b')
      mkdirSync(comma)
      expect(() => ensureSandbox(comma, 'node:fixture', daemon().call)).toThrow(
        DockerUnavailableError,
      )
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('calls Docker only from the suite, the worker command and worktree stop', () => {
    const importers: string[] = []
    const walk = (directory: string) => {
      for (const name of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, name.name)
        if (name.isDirectory()) walk(path)
        else if (
          path.endsWith('.ts') &&
          !path.includes(`${join('src', 'execution')}`) &&
          /from '[./]+execution\/docker\.js'/.test(readFileSync(path, 'utf8'))
        )
          importers.push(relative(resolve('.'), path).split('\\').join('/'))
      }
    }
    walk(resolve('src'))
    // A read-only step never calls these: research, framing, specification, scopes, slicing,
    // review and Rollout code have no reference to the project container at all.
    expect(importers.sort()).toEqual([
      'src/cli/exec.ts',
      'src/cli/verification.ts',
      'src/verification/suite.ts',
      'src/worktrees/manager.ts',
    ])
  })
})

function fixture(run: (context: ReturnType<typeof setup>) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-execution-'))
  return Promise.resolve(run(setup(dir))).finally(() =>
    rmSync(dir, { recursive: true, force: true }),
  )
}
function setup(dir: string) {
  const root = join(dir, 'repo with spaces'),
    bin = join(dir, 'bin'),
    log = join(dir, 'docker.log')
  mkdirSync(root)
  mkdirSync(bin)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(dir, 'none') },
    })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  git('init', '-b', 'main')
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'execution-fixture',
      private: true,
      scripts: { check: 'node suite.mjs' },
    }),
  )
  writeFileSync(join(root, 'suite.mjs'), "console.log('platform=' + process.platform)\n")
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'seed')
  // The fake host npm and fake Docker CLI say where they ran; the daemon state lives in a file.
  writeFileSync(join(bin, 'npm'), `#!${process.execPath}\nconsole.log('platform=host-fixture')\n`)
  chmodSync(join(bin, 'npm'), 0o755)
  const docker = (mode: 'up' | 'down') => {
    writeFileSync(
      join(bin, 'docker'),
      `#!${process.execPath}
const fs = require('node:fs'), args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
const state = ${JSON.stringify(join(dir, 'container'))}
if (${JSON.stringify(mode)} === 'down') { console.error('Cannot connect to the Docker daemon'); process.exit(1) }
if (args[0] === 'version') { console.log('linux 29.9.3'); process.exit(0) }
if (args[0] === 'image') { console.log(${JSON.stringify(IMAGE_ID)}); process.exit(0) }
if (args[0] === 'container' && args[1] === 'inspect') {
  if (!fs.existsSync(state)) process.exit(1)
  const box = JSON.parse(fs.readFileSync(state, 'utf8')), nets = box.networks.map(n => n + ' ').join('')
  const format = args.at(-2)
  console.log(format.includes('wholeloop.image') ? '1 ${IMAGE_ID} true ' + box.setup + ' ' + nets : format.startsWith('{{range') ? nets : '1'); process.exit(0)
}
if (args[0] === 'container' && args[1] === 'run') {
  const setup = (args.find(a => a.startsWith('wholeloop.setup=')) || 'wholeloop.setup=none').slice(16)
  fs.writeFileSync(state, JSON.stringify({ setup, networks: [args[args.indexOf('--network') + 1]] })); process.exit(0)
}
if (args[0] === 'network' && args[1] === 'disconnect') {
  const box = JSON.parse(fs.readFileSync(state, 'utf8')); box.networks = []; fs.writeFileSync(state, JSON.stringify(box)); process.exit(0)
}
if (args[0] === 'container' && args[1] === 'rm') { fs.rmSync(state, { force: true }); process.exit(0) }
if (args[0] === 'exec') { console.log('platform=container-fixture ' + args.slice(4).join(' ')); process.exit(0) }
process.exit(1)
`,
    )
    chmodSync(join(bin, 'docker'), 0o755)
  }
  docker('up')
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state/wholeloop')),
    root,
    join(dir, 'config/wholeloop/config.yml'),
    join(dir, 'home'),
  )
  const subject = engine.store.create({
    kind: 'review',
    title: 'Check empty input',
    owner: 'Fixture Owner',
    body: '',
    repository: root,
  }).id
  const plan = () =>
    new GateWorkflow(engine).plan(subject, 'verify', {
      base: 'main',
      rounds: 3,
      criteria: [{ id: 'empty', text: 'Return 400 for empty input', test: 'Send empty input' }],
    }).plan
  const env = {
    ...process.env,
    PATH: [bin, ...(process.env.PATH ?? '').split(delimiter)].join(delimiter),
    HOME: join(dir, 'home'),
    XDG_STATE_HOME: join(dir, 'state'),
    XDG_CONFIG_HOME: join(dir, 'config'),
    WL_WORKSPACE: '',
    // Present on the host; a contained command must not see it.
    WHOLELOOP_REHEARSAL_SECRET: 'visible-on-host',
  }
  const useRealDocker = () => rmSync(join(bin, 'docker'))
  const wl = (...args: string[]) => {
    const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8',
      env,
    })
    return { code: result.status, stdout: result.stdout, stderr: result.stderr }
  }
  const dockerCalls = () =>
    existsSync(log)
      ? readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as string[])
      : []
  const suite = (run: string, round: number, ...extra: string[]) =>
    wl(
      'verify',
      'suite',
      '--for',
      subject,
      '--run',
      run,
      '--round',
      String(round),
      '--commands',
      '["package.json#check"]',
      ...extra,
    )
  return { dir, root, engine, subject, plan, wl, suite, docker, dockerCalls, useRealDocker }
}

describe('setup with network, then offline (ADR-0260)', () => {
  it('accepts one plain installer command and refuses everything else', () => {
    expect(checkSetup('npm ci')).toEqual({ argv: ['npm', 'ci'], dependencies: 'node_modules' })
    expect(checkSetup(' uv  sync --frozen ')).toEqual({
      argv: ['uv', 'sync', '--frozen'],
      dependencies: '.venv',
    })
    expect(checkSetup('composer install').dependencies).toBe('vendor')
    for (const refused of [
      'yarn install',
      'curl https://example.com',
      'npm ci && curl x',
      'npm ci; rm -rf /',
      'npm ci $(id)',
      'npm ci > out',
      `npm ${'x '.repeat(16)}`,
      '',
    ])
      expect(() => checkSetup(refused), refused).toThrow('without shell syntax')
    expect(proposedSetup(['package-lock.json', 'README.md'])).toBe('npm ci')
    expect(proposedSetup(['uv.lock'])).toBe('uv sync --frozen')
    expect(proposedSetup(['yarn.lock'])).toBeUndefined()
  })

  it('reads setup only from the committed project file', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-setup-'))
    try {
      expect(repositorySetup(root)).toBeUndefined()
      mkdirSync(join(root, '.wholeloop'))
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        "version: 1\nanswers:\n  'execution:setup': npm ci\n",
      )
      expect(repositorySetup(root)?.argv).toEqual(['npm', 'ci'])
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        "version: 1\nanswers:\n  'execution:setup': 'npm ci && curl x'\n",
      )
      expect(() => repositorySetup(root)).toThrow('without shell syntax')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('runs setup once on a network, detaches it and reuses the offline container', () => {
    const { call, calls, state } = daemon()
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-sandbox-')))
    const workspace = join(dir, 'worktree'),
      store = join(dir, 'store')
    mkdirSync(workspace)
    const setup = checkSetup('npm ci')
    try {
      const sandbox = ensureSandbox(workspace, 'node:fixture', call, { setup, store })
      expect(sandbox.setup).toEqual({ argv: ['npm', 'ci'], ran: true })
      const run = calls.find((args) => args[1] === 'run') ?? []
      expect(run[run.indexOf('--network') + 1]).toBe('bridge')
      // Dependencies are written to the store, never into the worktree on the host.
      const cache = dependencyCache(workspace, store)
      expect(run).toContain(`type=bind,source=${cache},target=/workspace/node_modules`)
      expect(existsSync(cache)).toBe(true)
      expect(existsSync(join(workspace, 'node_modules'))).toBe(false)
      const order = calls.map((args) => args.slice(0, 2).join(' '))
      const at = (entry: string) => order.indexOf(entry)
      expect(at('exec --workdir')).toBeGreaterThan(at('container run'))
      expect(at('network disconnect')).toBeGreaterThan(at('exec --workdir'))
      expect(state.container?.networks).toEqual([])
      // Reuse runs nothing again and still proves the container is offline.
      const before = calls.length
      expect(ensureSandbox(workspace, 'node:fixture', call, { setup, store }).setup).toEqual({
        argv: ['npm', 'ci'],
        ran: false,
      })
      expect(calls.slice(before).some((args) => args[0] === 'exec' || args[1] === 'run')).toBe(
        false,
      )
      // A container found back on a network, or made for another setup, is replaced.
      if (state.container) state.container.networks = ['bridge']
      expect(ensureSandbox(workspace, 'node:fixture', call, { setup, store }).setup?.ran).toBe(true)
      ensureSandbox(workspace, 'node:fixture', call, { setup: checkSetup('npm install'), store })
      expect(calls.filter((args) => args[1] === 'run')).toHaveLength(3)
      // Without a declared setup the container never touches a network.
      ensureSandbox(workspace, 'node:fixture', call, { store })
      const last = calls.filter((args) => args[1] === 'run').at(-1) ?? []
      expect(last[last.indexOf('--network') + 1]).toBe('none')
      expect(last.join(' ')).not.toContain('node_modules')
      expect(stopSandbox(workspace, call, store)).toBe(true)
      expect(existsSync(cache)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each([
    ['a failed setup', { setupFails: true }, /Setup npm ci failed.*network unreachable/],
    ['a network that will not detach', { disconnectFails: true }, 'Could not take the project'],
  ] as const)('removes the container after %s', (_name, faults, message) => {
    const { call, calls, state } = daemon({ ...faults })
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-sandbox-')))
    try {
      expect(() =>
        ensureSandbox(dir, 'node:fixture', call, {
          setup: checkSetup('npm ci'),
          store: join(dir, 'store'),
        }),
      ).toThrow(message)
      expect(calls.at(-1)?.slice(0, 2)).toEqual(['container', 'rm'])
      expect(state.container).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('supervised suites and worker commands', () => {
  it('runs the suite in the container by default and records where it ran', () =>
    fixture(({ plan, suite, dockerCalls, engine }) => {
      const first = plan()
      const missing = suite(first.run, first.round)
      expect(missing.code).toBe(3)
      expect(missing.stderr).toMatch(/--image <name>.*--execution host/)
      expect(verificationRuns(engine.store.events())).toEqual([])
      const ran = suite(first.run, first.round, '--image', 'node:fixture', '--json')
      expect(ran.code).toBe(0)
      const payload = JSON.parse(ran.stdout)
      expect(payload.output[0].stdout).toContain('platform=container-fixture npm run check')
      expect(payload.execution).toEqual({
        isolation: 'docker',
        source: 'default',
        image: 'node:fixture',
        imageId: IMAGE_ID,
      })
      expect(dockerCalls().map((args) => args.slice(0, 2).join(' '))).toEqual(
        expect.arrayContaining([
          'version --format',
          'image inspect',
          'container run',
          'exec --workdir',
        ]),
      )
      expect(verificationRuns(engine.store.events())[0]?.execution).toMatchObject({
        isolation: 'docker',
        imageId: IMAGE_ID,
      })
      const text = suite(first.run, first.round, '--image', 'node:fixture')
      expect(text.stdout).toContain('Ran in')
      expect(text.stdout).toContain('Docker container · node:fixture')
    }))

  it('refuses before planning anything when Docker is unreachable and names both remedies', () =>
    fixture(({ plan, suite, docker, engine }) => {
      docker('down')
      const first = plan()
      const refused = suite(first.run, first.round, '--image', 'node:fixture')
      expect(refused.code).toBe(3)
      expect(refused.stderr).toContain('Start Docker')
      expect(refused.stderr).toContain('--execution host')
      expect(verificationRuns(engine.store.events())).toEqual([])
      const host = suite(first.run, first.round, '--execution', 'host')
      expect(host.code).toBe(0)
      expect(host.stdout).toContain('This machine, not isolated (chosen for this run)')
      expect(verificationRuns(engine.store.events())[0]?.execution).toEqual({
        run: first.run,
        round: first.round,
        isolation: 'host',
        source: 'run',
      })
    }))

  it('honours a repository host choice saved only at project scope', () =>
    fixture(({ plan, suite, wl, dockerCalls, root }) => {
      expect(wl('setup', '--execution', 'host', '--scope', 'user').code).toBe(4)
      expect(wl('setup', '--execution', 'host', '--scope', 'project').code).toBe(0)
      expect(readFileSync(join(root, '.wholeloop/config.yml'), 'utf8')).toContain('host')
      const begun = wl('verify', 'begin', '--base', 'main')
      expect(begun.stdout).toContain('This machine, not isolated (chosen for this repository)')
      const first = plan()
      const ran = suite(first.run, first.round, '--json')
      expect(JSON.parse(ran.stdout)).toMatchObject({
        execution: {
          isolation: 'host',
          source: 'repository',
          note: 'ran on this machine, not isolated',
        },
        output: [{ stdout: expect.stringContaining('platform=host-fixture') }],
      })
      expect(dockerCalls()).toEqual([])
    }))

  it('never lets the autonomous runner take the host', async () =>
    fixture(async ({ engine, subject, plan }) => {
      const first = plan()
      const executor = async () => {
        throw new Error('must not run')
      }
      await expect(
        runSuite(engine, subject, first.run, first.round, { executor, execution: 'host' }),
      ).rejects.toThrow('always runs project code in its own Docker environment')
      expect(verificationRuns(engine.store.events())).toEqual([])
    }))

  it('runs worker commands in the same warm container and keeps -- arguments for the command', () =>
    fixture(({ wl, subject, dockerCalls }) => {
      expect(wl('setup', '--image', 'node:fixture', '--scope', 'project').code).toBe(0)
      const first = wl('exec', '--for', subject, '--', 'npm', 'test', '--json')
      expect(first.code).toBe(0)
      expect(first.stdout).toContain('platform=container-fixture npm test --json')
      expect(first.stderr).toContain('Ran in a Docker container (node:fixture).')
      const json = JSON.parse(
        wl('exec', '--for', subject, '--json', '--cwd', '.', '--', 'npm', 'test').stdout,
      )
      expect(json).toMatchObject({ isolation: 'docker', image: 'node:fixture', exitCode: 0 })
      expect(dockerCalls().filter((args) => args[1] === 'run')).toHaveLength(1)
      expect(wl('exec', '--for', subject, '--cwd', '..', '--', 'npm', 'test').code).toBe(3)
      expect(wl('exec', '--for', subject, '--stop').stdout).toContain('Project container removed')
      expect(wl('exec', '--for', subject, '--stop').stdout).toContain('No project container')
    }))

  it('records setup with its network before the suite and in worker commands', () =>
    fixture(({ wl, plan, suite, subject, engine, dockerCalls }) => {
      expect(wl('setup', '--project-setup', 'npm ci', '--scope', 'user').code).toBe(4)
      expect(
        wl('setup', '--project-setup', 'npm ci', '--image', 'node:fixture', '--scope', 'project')
          .code,
      ).toBe(0)
      const begun = wl('verify', 'begin', '--base', 'main')
      expect(begun.stdout).toContain('npm ci, with network, once per workspace')
      const first = plan()
      const ran = JSON.parse(suite(first.run, first.round, '--json').stdout)
      expect(ran.execution.setup).toEqual({ command: 'npm ci', network: true, ran: true })
      expect(verificationRuns(engine.store.events())[0]?.setup).toEqual({
        run: first.run,
        round: first.round,
        argv: ['npm', 'ci'],
        network: 'bridge',
        ran: true,
      })
      const order = dockerCalls().map((args) => args.slice(0, 2).join(' '))
      expect(order.indexOf('network disconnect')).toBeLessThan(order.lastIndexOf('exec --workdir'))
      const worker = wl('exec', '--for', subject, '--', 'npm', 'test')
      expect(worker.stderr).toContain('offline after setup npm ci ran earlier with network')
      expect(dockerCalls().filter((args) => args[1] === 'run')).toHaveLength(1)
    }))

  it('proposes setup from a lock file and never applies it on its own', () =>
    fixture(({ wl, root }) => {
      writeFileSync(join(root, 'package-lock.json'), '{}')
      const asked = JSON.parse(wl('setup', '--json').stdout)
      expect(
        asked.questions.find((question: { id: string }) => question.id === 'project-setup'),
      ).toMatchObject({ options: [{ value: 'npm ci' }], freeText: true })
      expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
    }))

  it('never touches Docker in steps that only read', () =>
    fixture(({ wl, dockerCalls }) => {
      expect(wl('next', 'Find old orders faster', '--owner', 'Alex', '--json').code).toBe(0)
      wl('status', '--json')
      wl('setup', '--json')
      wl('verify', 'begin', '--base', 'main', '--json')
      expect(dockerCalls()).toEqual([])
    }))

  it('shows where project code runs before verification starts', () => {
    const display = stepDisplay('verify begin', {
      status: 'question',
      projectCode: { isolation: 'docker', source: 'default', image: null },
    })
    expect(display.rows).toContainEqual({
      label: 'Project code',
      value: 'Docker container · image not chosen yet',
    })
  })
})

// The real rehearsal needs a local Docker daemon and a cached node:22-bookworm image; CI and the
// default gate skip it, and the evidence is recorded in the journal when it runs.
describe.runIf(process.env.WHOLELOOP_DOCKER_REHEARSAL === '1')('Docker rehearsal', () => {
  it('runs the fixture suite and a worker command in a real contained container', () =>
    fixture((context) => {
      context.useRealDocker()
      try {
        rehearse(context)
      } finally {
        // A failed expectation must not leave a running container behind.
        context.wl('exec', '--for', context.subject, '--stop')
      }
    }))
  it('installs a dependency with network during setup and runs every later command offline', () =>
    fixture((context) => {
      context.useRealDocker()
      try {
        rehearseSetup(context)
      } finally {
        context.wl('exec', '--for', context.subject, '--stop')
      }
    }))
})
/** ADR-0260: setup reaches the registry once; the suite then runs offline with its dependency. */
function rehearseSetup({ plan, suite, wl, root, dir }: ReturnType<typeof setup>) {
  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'execution-fixture',
      private: true,
      dependencies: { ms: '2.1.3' },
      scripts: { check: 'node suite.mjs' },
    }),
  )
  // The real npm next to this Node writes the lock; the fixture's npm on PATH is a fake.
  run(join(dirname(process.execPath), 'npm'), [
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ])
  writeFileSync(
    join(root, 'suite.mjs'),
    [
      "import ms from 'ms'",
      "console.log('dependency=' + ms('2 days'))",
      "const net = await fetch('https://example.com').then(() => 'reached', () => 'blocked')",
      "console.log('network=' + net)",
    ].join('\n'),
  )
  run('git', ['add', '.'])
  run('git', [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-m',
    'dependency',
  ])
  expect(
    wl('setup', '--image', 'node:22-bookworm', '--project-setup', 'npm ci', '--scope', 'project')
      .code,
  ).toBe(0)
  run('git', ['add', '.'])
  run('git', [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-m',
    'setup',
  ])
  const first = plan()
  const ran = suite(first.run, first.round, '--json')
  expect(ran.stderr).toBe('')
  const payload = JSON.parse(ran.stdout)
  expect(payload.output[0].stdout).toContain('dependency=172800000')
  expect(payload.output[0].stdout).toContain('network=blocked')
  expect(payload.execution.setup).toEqual({ command: 'npm ci', network: true, ran: true })
  // The dependency lives in the store; the worktree on the host only gains an empty mount point.
  const host = join(root, 'node_modules')
  expect(existsSync(host) ? readdirSync(host) : []).toEqual([])
  expect(existsSync(join(dir, 'state/wholeloop/execution'))).toBe(true)
}

function rehearse({ plan, suite, wl, subject, root, dir }: ReturnType<typeof setup>) {
  writeFileSync(
    join(root, 'suite.mjs'),
    [
      "import { existsSync } from 'node:fs'",
      "console.log('platform=' + process.platform + ' home=' + process.env.HOME)",
      `console.log('host-path=' + (existsSync(${JSON.stringify(dir)}) ? 'visible' : 'hidden'))`,
      "console.log('secret=' + (process.env.WHOLELOOP_REHEARSAL_SECRET ?? 'absent'))",
      "const net = await fetch('https://example.com').then(() => 'reached', () => 'blocked')",
      "console.log('network=' + net)",
    ].join('\n'),
  )
  expect(wl('setup', '--image', 'node:22-bookworm', '--scope', 'project').code).toBe(0)
  const first = plan()
  const ran = suite(first.run, first.round, '--json')
  expect(ran.stderr).toBe('')
  const payload = JSON.parse(ran.stdout)
  const output = payload.output[0].stdout
  expect(output).toContain('platform=linux home=/tmp')
  expect(output).toContain('host-path=hidden')
  expect(output).toContain('secret=absent')
  expect(output).toContain('network=blocked')
  expect(payload).toMatchObject({ current: true, result: { status: 'passed' } })
  expect(payload.execution.imageId).toMatch(/^sha256:/)
  const exec = wl(
    'exec',
    '--for',
    subject,
    '--',
    'node',
    '-e',
    'console.log("exec=" + process.platform)',
  )
  expect(exec.stdout).toContain('exec=linux')
  expect(exec.stderr).toContain('Ran in a Docker container (node:22-bookworm).')
  expect(wl('exec', '--for', subject, '--stop').stdout).toContain('Project container removed')
}
