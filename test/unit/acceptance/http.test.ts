import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { observeHttp } from '../../../src/acceptance/http.js'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections()
          s.close(() => resolve())
        }),
    ),
  )
})
async function fixture() {
  let foreign = 0
  const server = createServer((req, res) => {
    if (req.url === '/foreign') {
      foreign++
      res.end('{}')
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: 'http://localhost:1/foreign' })
      res.end()
    } else if (req.url === '/partial') {
      res.writeHead(200, { 'content-length': '100' })
      res.write('{"count":0}')
      setTimeout(() => res.destroy(), 10)
    } else if (req.url === '/big') res.end('x'.repeat(200))
    else if (req.url === '/bad') res.end('{')
    else if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-length': '20' })
      res.end()
    } else res.end('{"count":0,"empty":"","value":null}')
  })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing actual port')
  return { origin: `http://127.0.0.1:${address.port}`, foreign: () => foreign }
}
describe('actual bounded HTTP observations', () => {
  it('reads complete real JSON and preserves literal values', async () => {
    const { origin } = await fixture()
    const observed = await observeHttp(
      origin,
      { id: 'get', kind: 'request', method: 'GET', path: '/' },
      AbortSignal.timeout(2000),
      1024,
    )
    expect(observed.json).toEqual({ count: 0, empty: '', value: null })
    expect(observed.status).toBe(200)
  })
  it.each(['/partial', '/big', '/redirect'])(
    'refuses %s without inventing a complete response',
    async (path) => {
      const { origin, foreign } = await fixture()
      await expect(
        observeHttp(
          origin,
          { id: 'get', kind: 'request', method: 'GET', path },
          AbortSignal.timeout(2000),
          100,
        ),
      ).rejects.toThrow()
      expect(foreign()).toBe(0)
    },
  )
  it('records invalid JSON explicitly and supports a bodyless HEAD', async () => {
    const { origin } = await fixture()
    expect(
      (
        await observeHttp(
          origin,
          { id: 'bad', kind: 'request', path: '/bad' },
          AbortSignal.timeout(2000),
          100,
        )
      ).jsonError,
    ).toBe(true)
    const head = await observeHttp(
      origin,
      { id: 'head', kind: 'request', method: 'HEAD', path: '/' },
      AbortSignal.timeout(2000),
      100,
    )
    expect(head.status).toBe(200)
    expect(head.text).toBe('')
  })
  it('honors cancellation before dispatch', async () => {
    const { origin } = await fixture()
    const abort = new AbortController()
    abort.abort()
    await expect(
      observeHttp(origin, { id: 'cancel', kind: 'request', path: '/' }, abort.signal, 100),
    ).rejects.toThrow()
  })
})
