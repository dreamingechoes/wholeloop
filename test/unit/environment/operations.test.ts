import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  DockerCli,
  type DockerProcessObservation,
} from '../../../src/environment/docker-command.js'
import { DOCKER_OPERATION_WRAPPER } from '../../../src/environment/operation-wrapper.js'
import { EnvironmentOperations, operationGroup } from '../../../src/environment/operations.js'
import { StoreFiles } from '../../../src/state/files.js'

const environment = `environment-${'a'.repeat(32)}`
it('drains complete negative-exit output and binds the client close to the exact observed invoker', () =>
  fixture(async (_dir, operations) => {
    const args = ['container', 'start', '--attach', '--interactive', 'owned-fixture']
    const registration = operations.begin(args, 10000)
    const child = spawn(process.execPath, ['--input-type=module', '-e', DOCKER_OPERATION_WRAPPER], {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (!child.pid) throw new Error('Missing observed wrapper PID')
    registration.started(child.pid)
    let bytes = 0
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      child.stdout.pause()
      setTimeout(() => child.stdout.resume(), 10)
    })
    child.stderr.resume()
    child.stdin.end(
      JSON.stringify({
        operation: registration.operation,
        nonce: registration.nonce,
        cancel: registration.cancel,
        outcome: registration.outcome,
        command: process.execPath,
        args: ['-e', "process.stdout.write('x'.repeat(220000));process.exitCode=7"],
        input: '',
        timeoutMs: 10000,
      }),
    )
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    expect(code).toBe(1)
    expect(bytes).toBe(220000)
    expect(operations.completion(args, child.pid)).toMatchObject({
      operation: registration.operation,
      code: 7,
    })
    expect(operations.completion(args, child.pid + 1)).toBeUndefined()
    expect(operations.completion(['container', 'start', 'different'], child.pid)).toBeUndefined()
  }))
async function fixture(run: (dir: string, operations: EnvironmentOperations) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-docker-operations-')))
  try {
    await run(
      dir,
      new EnvironmentOperations(new StoreFiles(join(dir, 'state')), environment, 'host-observed'),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
it('registers the actual wrapper before any command/input and retains an observed completed client', () =>
  fixture(async (dir, operations) => {
    const binary = join(dir, 'fixture-docker')
    writeFileSync(
      binary,
      "#!/usr/bin/env node\nconst fs=require('node:fs');const started=JSON.parse(fs.readFileSync(process.argv.at(-1),'utf8'));let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>console.log(JSON.stringify({input,registered:started.pid===process.ppid})))\n",
      { mode: 0o700 },
    )
    const registration = operations.begin(['container', 'create', 'fixture'], 10000)
    const started = registration.outcome.replace(/outcome\.json$/, 'started.json')
    const processes: DockerProcessObservation[] = []
    const observedOutput: Buffer[] = []
    const result = await new DockerCli(binary).call(['container', 'create', started], {
      registration,
      process: (value) => processes.push(value),
      observe: (_stream, bytes) => observedOutput.push(Buffer.from(bytes)),
      input: 'owned non-secret input',
      timeoutMs: 10000,
    })
    expect(result.status).toBe('succeeded')
    expect(processes).toHaveLength(1)
    expect(processes[0]?.argv[0]).toBe(process.execPath)
    expect(processes[0]?.code).toBe(0)
    expect(processes[0]?.pid).toBe(JSON.parse(readFileSync(started, 'utf8')).pid)
    expect(Buffer.concat(observedOutput).toString('utf8')).toBe(result.stdout)
    expect(JSON.parse(result.stdout)).toEqual({ input: 'owned non-secret input', registered: true })
    operations.close(registration, result)
    expect(operations.inspect()[0]?.status).toBe('stopped')
    expect(JSON.parse(readFileSync(registration.outcome, 'utf8'))).toMatchObject({
      reason: 'finished',
      code: 0,
      nonce: registration.nonce,
    })
  }))
it('cancels a live owned client through its private channel and observes the whole wrapper group gone', () =>
  fixture(async (dir, operations) => {
    const binary = join(dir, 'fixture-docker')
    writeFileSync(
      binary,
      "#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.argv.at(-1),'live');setInterval(()=>{},100)\n",
      { mode: 0o700 },
    )
    const registration = operations.begin(['container', 'create', 'fixture'], 10000)
    const live = join(dir, 'client-live')
    const pending = new DockerCli(binary).call(['container', 'create', live], {
      registration,
      timeoutMs: 10000,
    })
    const started = registration.outcome.replace(/outcome\.json$/, 'started.json')
    const deadline = Date.now() + 10000
    while ((!existsSync(started) || !existsSync(live)) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10))
    expect(existsSync(started)).toBe(true)
    expect(existsSync(live)).toBe(true)
    operations.fence('cancel-test', 'Cancel only the owned fixture operation.')
    operations.cancelAll()
    const result = await pending
    operations.close(registration, result)
    expect(result.status).not.toBe('succeeded')
    expect(operations.inspect()[0]?.status).toBe('stopped')
    expect(JSON.parse(readFileSync(registration.outcome, 'utf8')).reason).toBe('cancelled')
  }))
it('never signals a reused/unrelated process group and refuses starts after fencing', () =>
  fixture(async (dir, operations) => {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},100)'], {
      detached: true,
      stdio: 'ignore',
      env: { PATH: process.env.PATH, HOME: dir },
    })
    try {
      if (!child.pid) throw new Error('Fixture child did not start')
      const registration = operations.begin(['container', 'create', 'fixture'], 10000)
      registration.started(child.pid)
      expect(operationGroup(child.pid).status).toBe('present')
      operations.fence('reuse-test', 'Retain an ambiguous stored process identity.')
      operations.cancelAll()
      expect(operations.inspect()[0]?.status).toBe('unknown')
      expect(() => process.kill(child.pid ?? 0, 0)).not.toThrow()
      expect(() => operations.begin(['container', 'start', 'fixture'], 1000)).toThrow(
        'environment-fenced',
      )
    } finally {
      child.kill('SIGKILL')
      await new Promise((resolve) => child.once('close', resolve))
    }
  }))
it('closes prepared but undispatched work without inventing a process or accepting unknown metadata', () =>
  fixture(async (_dir, operations) => {
    const registration = operations.begin(['container', 'create', 'fixture'], 1000)
    operations.fence('prestart-test', 'No private input was dispatched.')
    operations.cancelAll()
    expect(operations.inspect()[0]?.status).toBe('not-started')
    expect(() => registration.started(process.pid)).toThrow('environment-fenced')
    const path = operations.files.path(
      `delivery/environment-operations/${environment}/${registration.operation}/future.json`,
    )
    writeFileSync(path, '{}')
    expect(() => operations.inspect()).toThrow('unknown-operation-format')
  }))
