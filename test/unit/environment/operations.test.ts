import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { EnvironmentOperations, operationGroup } from '../../../src/environment/operations.js'
import { StoreFiles } from '../../../src/state/files.js'

const environment = `environment-${'a'.repeat(32)}`
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
    const result = await new DockerCli(binary).call(['container', 'create', started], {
      registration,
      input: 'owned non-secret input',
      timeoutMs: 10000,
    })
    expect(result.status).toBe('succeeded')
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
