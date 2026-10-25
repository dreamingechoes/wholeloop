import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { DOCKER_INTERACTIVE_WRAPPER } from '../../../src/environment/interactive-wrapper.js'
import { EnvironmentOperations } from '../../../src/environment/operations.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { StoreFiles } from '../../../src/state/files.js'

const environment = `environment-${'a'.repeat(32)}`,
  container = 'b'.repeat(64)
async function fixture(run: (operations: EnvironmentOperations) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-private-browser-')))
  const files = new StoreFiles(join(dir, 'state'))
  new EnvironmentResources(files).create({
    schema: 'wholeloop/environment-runtime@1',
    id: environment,
    run: `delivery-${'a'.repeat(16)}`,
    basis: 'b'.repeat(64),
    recipe: 'c'.repeat(64),
    key: 'fixture',
    grant: `authorization-${'d'.repeat(16)}`,
    grantDigest: 'e'.repeat(64),
    token: 'fixture-owner',
    effect: `effect-${'f'.repeat(32)}`,
    createdAt: '2026-10-25T00:00:00.000Z',
    deadline: '2026-10-25T00:01:00.000Z',
    lifetimeDeadline: '2026-10-25T04:00:00.000Z',
    state: 'planned',
    provenance: 'fixture',
    helperImage: DOCKER_REFERENCE_HELPER,
    host: { os: 'fixture', architecture: 'arm64' },
    candidates: [],
    resources: [
      {
        kind: 'container',
        slot: 'browser',
        purpose: 'service',
        name: 'owned-browser',
        token: 'browser-token',
        id: container,
        stamp: 'a'.repeat(64),
        status: 'observed',
      },
    ],
    observations: [],
    acceptance: 'not-established',
    publication: 'not-performed',
  })
  try {
    await run(new EnvironmentOperations(files, environment, 'fixture'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const args = ['container', 'exec', '--interactive', container, 'node', '/app/cli.js']
async function execute(
  operations: EnvironmentOperations,
  code: string,
  input: string,
  cancel = false,
) {
  const registration = operations.begin(args, 10000)
  const child = spawn(process.execPath, ['--input-type=module', '-e', DOCKER_INTERACTIVE_WRAPPER], {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (!child.pid) throw new Error('Missing actual wrapper process')
  registration.started(child.pid)
  const output: Buffer[] = []
  child.stdout.on('data', (bytes: Buffer) => {
    output.push(bytes)
    child.stdout.pause()
    setTimeout(() => child.stdout.resume(), 5)
  })
  child.stderr.resume()
  child.stdin.on('error', () => {})
  child.stdin.end(
    `${JSON.stringify({ operation: registration.operation, nonce: registration.nonce, cancel: registration.cancel, outcome: registration.outcome, command: process.execPath, args: ['-e', code], timeoutMs: 10000 })}\n${input}`,
  )
  if (cancel) operations.cancel(registration)
  const exit = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  operations.close(registration, {
    status: cancel ? 'cancelled' : exit === 0 ? 'succeeded' : 'crashed',
    code: exit,
    stdout: '',
    digest: contractDigest({ output: Buffer.concat(output).toString('utf8') }),
  })
  return { registration, exit, output: Buffer.concat(output).toString('utf8'), pid: child.pid }
}
it('registers before duplex input, drains complete output and permits another exec only after observed release', () =>
  fixture(async (operations) => {
    const observed = await execute(
      operations,
      "let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>process.stdout.write(text+'x'.repeat(220000)))",
      'literal input',
    )
    expect(observed.output).toBe(`literal input${'x'.repeat(220000)}`)
    expect(observed.exit).toBe(0)
    expect(operations.list()[0]?.schema).toBe('wholeloop/environment-operation@2')
    expect(() => operations.begin(args, 10000)).toThrow('prior-exec-unresolved')
    operations.releaseExec(observed.registration, 'a'.repeat(64))
    operations.releaseExec(observed.registration, 'a'.repeat(64))
    expect(operations.begin(args, 10000).operation).not.toBe(observed.registration.operation)
  }))
it('refuses foreign targets and changed release bindings without any exec dispatch', () =>
  fixture(async (operations) => {
    expect(() => operations.begin(['container', 'exec', '--interactive', 'foreign'], 1000)).toThrow(
      'unowned-exec',
    )
    const observed = await execute(operations, 'process.stdin.resume()', '')
    operations.releaseExec(observed.registration, 'a'.repeat(64))
    const file = observed.registration.outcome.replace('outcome.json', 'exec-release.json')
    const value = JSON.parse(readFileSync(file, 'utf8'))
    value.resource = 'c'.repeat(64)
    writeFileSync(file, JSON.stringify(value))
    expect(() => operations.list()).toThrow('changed-exec-release')
  }))
it('retains a nonzero private client as unresolved rather than replaying its UI actions', () =>
  fixture(async (operations) => {
    const observed = await execute(operations, 'process.exitCode=7;process.stdin.resume()', '')
    expect(observed.exit).toBe(1)
    expect(operations.completion(args, observed.pid)?.code).toBe(7)
    expect(() => operations.releaseExec(observed.registration, 'a'.repeat(64))).toThrow(
      'unresolved',
    )
    expect(() => operations.begin(args, 10000)).toThrow('prior-exec-unresolved')
  }))
it('cancels only its live private channel and never releases uncertain actions for replay', () =>
  fixture(async (operations) => {
    const observed = await execute(operations, 'setInterval(()=>{},1000)', '', true)
    expect(observed.exit).not.toBe(0)
    expect(operations.completion(args, observed.pid)).toBeUndefined()
    expect(() => operations.releaseExec(observed.registration, 'a'.repeat(64))).toThrow(
      'unresolved',
    )
    expect(() => operations.begin(args, 10000)).toThrow('prior-exec-unresolved')
  }))
