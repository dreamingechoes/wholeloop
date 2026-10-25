import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { ownedRequestUrl } from '../../../src/acceptance/behavior-input.js'
import { evaluatePrivate } from '../../../src/acceptance/private-engine.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { privatePlan } from '../../support/private.js'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        }),
    ),
  )
})
async function server(status: number, partial = false) {
  let requests = 0
  const application = createServer((_request, response) => {
    requests++
    if (partial) {
      response.writeHead(status, { 'content-length': '100' })
      response.write('private partial')
      setTimeout(() => response.destroy(), 10)
    } else {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end('{"private":"actual private response"}')
    }
  })
  servers.push(application)
  await new Promise<void>((resolve, reject) => {
    application.once('error', reject)
    application.listen(0, '127.0.0.1', resolve)
  })
  const address = application.address()
  if (!address || typeof address === 'string') throw new Error('No actual server port')
  return { origin: `http://127.0.0.1:${address.port}`, requests: () => requests }
}
it.each([201, 400])(
  'observes the actual negative request at %i without leaking hidden values',
  (status) =>
    acceptanceFixture(async ({ plan }) => {
      const application = await server(status),
        input = privatePlan(plan)
      const result = await evaluatePrivate(
        input,
        application.origin,
        AbortSignal.timeout(2000),
        1024,
      )
      expect(result.assertions[0]?.status).toBe(status === 400 ? 'passed' : 'failed')
      expect(result.complete).toBe(true)
      expect(JSON.stringify(result)).not.toContain('actual private response')
      expect(application.requests()).toBe(1)
    }),
)
it('refuses a truncated response rather than manufacturing a baseline failure', () =>
  acceptanceFixture(async ({ plan }) => {
    const application = await server(400, true)
    await expect(
      evaluatePrivate(privatePlan(plan), application.origin, AbortSignal.timeout(2000), 1024),
    ).rejects.toThrow()
    expect(application.requests()).toBe(1)
  }))
it('honors cancellation and rejects unsupported origins and limits before issuing a request', () =>
  acceptanceFixture(async ({ plan }) => {
    const application = await server(400),
      input = privatePlan(plan),
      abort = new AbortController()
    abort.abort()
    await expect(evaluatePrivate(input, application.origin, abort.signal, 1024)).rejects.toThrow()
    for (const [origin, limit] of [
      ['https://foreign', 1024],
      [application.origin, Number.NaN],
      [application.origin, 9 * 1024 * 1024],
    ] as const)
      await expect(
        evaluatePrivate(input, origin, new AbortController().signal, limit),
      ).rejects.toThrow()
    expect(application.requests()).toBe(0)
  }))

it('canonicalizes the default owned HTTP port while retaining foreign-origin and credential refusal', () => {
  expect(ownedRequestUrl('http://127.0.0.1:80', '/tasks')).toBe('http://127.0.0.1/tasks')
  expect(() => ownedRequestUrl('http://name:password@127.0.0.1:80', '/tasks')).toThrow()
  expect(() => ownedRequestUrl('http://127.0.0.1:80', '//foreign/tasks')).toThrow()
})
