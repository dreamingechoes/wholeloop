import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DockerCli } from '../../../src/environment/docker-command.js'
import {
  engineQuery,
  engineRequests,
  observeEngineTarget,
} from '../../../src/environment/docker-engine.js'

const roots: string[] = [],
  servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  )
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function directory() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wl-engine-')))
  roots.push(root)
  return root
}
async function daemon(routes: Record<string, { status?: number; body: string; delay?: number }>) {
  const socket = join(directory(), 'd.sock'),
    requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    const route = routes[request.url ?? '']
    const reply = () => {
      response.writeHead(route?.status ?? (route ? 200 : 404), {
        'content-type': 'application/json',
      })
      response.end(route?.body ?? '{"message":"No such object"}')
    }
    if (route?.delay) setTimeout(reply, route.delay)
    else reply()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(socket, resolve))
  return { target: { socket, version: '1.51' }, requests }
}

describe('in-process inert Docker queries (ADR-0244)', () => {
  it('serves only exact read-only shapes with a raw API equivalent', () => {
    expect(engineRequests(['container', 'inspect', 'a1', 'b2'])?.paths).toEqual([
      '/containers/a1/json',
      '/containers/b2/json',
    ])
    expect(engineRequests(['volume', 'inspect', 'wl-data'])?.paths).toEqual(['/volumes/wl-data'])
    expect(engineRequests(['network', 'inspect', 'n'])?.paths).toEqual(['/networks/n'])
    for (const args of [
      // Daemon identity guards effects and must follow the CLI's current target.
      ['info', '--format', '{{json .}}'],
      ['info', '--format', '{{.ID}}'],
      ['version', '--format', '{{json .}}'],
      ['image', 'inspect', 'node'],
      ['context', 'inspect'],
      ['info'],
      ['info', '--format', '{{.Name}}'],
      ['container', 'inspect', '--size', 'a'],
      ['container', 'inspect', '../x'],
      ['container', 'inspect'],
      ['container', 'start', 'a'],
      ['container', 'inspect', ...Array.from({ length: 17 }, (_, i) => `c${i}`)],
    ])
      expect(engineRequests(args), JSON.stringify(args)).toBeUndefined()
  })

  it('answers in argument order through the negotiated API version', async () => {
    const { target, requests } = await daemon({
      '/v1.51/containers/b/json': { body: '{"Id":"b"}' },
      '/v1.51/containers/a/json': { body: '{"Id":"a"}' },
      '/v1.51/volumes/wl-data': { body: '{"Name":"wl-data"}' },
      '/v1.51/info': { body: '{"ID":"daemon","OSType":"linux"}' },
    })
    const inspected = await engineQuery(target, ['container', 'inspect', 'b', 'a'])
    expect(inspected?.status).toBe('succeeded')
    expect(JSON.parse(inspected?.stdout ?? '')).toEqual([{ Id: 'b' }, { Id: 'a' }])
    expect(
      JSON.parse((await engineQuery(target, ['volume', 'inspect', 'wl-data']))?.stdout ?? ''),
    ).toEqual([{ Name: 'wl-data' }])
    expect(await engineQuery(target, ['info', '--format', '{{.ID}}'])).toBeUndefined()
    expect(requests).toEqual([
      'GET /v1.51/containers/b/json',
      'GET /v1.51/containers/a/json',
      'GET /v1.51/volumes/wl-data',
    ])
  })

  it('leaves every incomplete answer to the original CLI path', async () => {
    const { target } = await daemon({
      '/v1.51/containers/a/json': { body: '{"Id":"a"}' },
      '/v1.51/containers/big/json': { body: JSON.stringify({ Id: 'x'.repeat(4096) }) },
      '/v1.51/containers/bad/json': { body: 'not json' },
      '/v1.51/containers/slow/json': { body: '{}', delay: 500 },
      '/v1.51/containers/err/json': { status: 500, body: '{}' },
    })
    expect(await engineQuery(target, ['container', 'inspect', 'a', 'missing'])).toBeUndefined()
    expect(
      await engineQuery(target, ['container', 'inspect', 'big'], { outputBytes: 1024 }),
    ).toBeUndefined()
    expect(await engineQuery(target, ['container', 'inspect', 'bad'])).toBeUndefined()
    expect(await engineQuery(target, ['container', 'inspect', 'err'])).toBeUndefined()
    expect(
      await engineQuery(target, ['container', 'inspect', 'slow'], { timeoutMs: 50 }),
    ).toBeUndefined()
    const aborted = new AbortController()
    aborted.abort()
    expect(
      await engineQuery(target, ['container', 'inspect', 'a'], { signal: aborted.signal }),
    ).toBeUndefined()
    expect(await engineQuery(undefined, ['container', 'inspect', 'a'])).toBeUndefined()
    expect(
      await engineQuery({ socket: join(directory(), 'absent.sock'), version: '1.51' }, [
        'container',
        'inspect',
        'a',
      ]),
    ).toBeUndefined()
  })

  it('learns the target only from owned preflight answers', () => {
    const context = ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'],
      version = ['version', '--format', '{{json .}}']
    let target = observeEngineTarget(context, '"unix:///run/docker.sock"\n', {})
    target = observeEngineTarget(
      version,
      JSON.stringify({ Client: { ApiVersion: '1.51' } }),
      target,
    )
    expect(target).toEqual({ socket: '/run/docker.sock', version: '1.51' })
    expect(observeEngineTarget(context, '"tcp://127.0.0.1:2375"', target)).toEqual({
      version: '1.51',
    })
    expect(observeEngineTarget(context, '"ssh://host"', target)).toEqual({ version: '1.51' })
    expect(observeEngineTarget(version, '{"Client":{"ApiVersion":"x"}}', target)).toEqual({
      socket: '/run/docker.sock',
    })
    expect(observeEngineTarget(['info', '--format', '{{json .}}'], '{}', target)).toEqual(target)
    expect(observeEngineTarget(context, 'not json', target)).toEqual(target)
  })

  it('answers through the CLI transport only after its preflight, without launching', async () => {
    const { target, requests } = await daemon({
      '/v1.51/containers/c1/json': { body: '{"Id":"c1"}' },
    })
    const root = directory(),
      bin = join(root, 'docker'),
      log = join(root, 'launches')
    writeFileSync(log, '')
    writeFileSync(
      bin,
      `#!/bin/sh\necho "$1" >> '${log}'\ncase "$1" in context) echo '"unix://${target.socket}"';; version) echo '{"Client":{"ApiVersion":"1.51"}}';; *) exit 2;; esac\n`,
    )
    chmodSync(bin, 0o700)
    const cli = new DockerCli(bin, { PATH: process.env.PATH, HOME: root })
    const inspect = ['container', 'inspect', 'c1']
    expect(await cli.query(inspect)).toBeUndefined()
    await cli.call(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'])
    expect(await cli.query(inspect)).toBeUndefined()
    await cli.call(['version', '--format', '{{json .}}'])
    expect(JSON.parse((await cli.query(inspect))?.stdout ?? '')).toEqual([{ Id: 'c1' }])
    // Another transport of the same CLI and connection variables shares the learned target.
    const sibling = new DockerCli(bin, { PATH: process.env.PATH, HOME: root })
    expect(JSON.parse((await sibling.query(inspect))?.stdout ?? '')).toEqual([{ Id: 'c1' }])
    expect(
      await new DockerCli(bin, {
        PATH: process.env.PATH,
        HOME: root,
        DOCKER_CONTEXT: 'other',
      }).query(inspect),
    ).toBeUndefined()
    expect(readFileSync(log, 'utf8')).toBe('context\nversion\n')
    expect(requests).toEqual(['GET /v1.51/containers/c1/json', 'GET /v1.51/containers/c1/json'])
  })
})
