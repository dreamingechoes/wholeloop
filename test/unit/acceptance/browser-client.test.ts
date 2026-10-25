import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { expect, it } from 'vitest'
import { BrowserMcpSession } from '../../../src/acceptance/browser-client.js'
import { BROWSER_REFERENCE } from '../../../src/acceptance/browser-reference.js'
import observed from '../../fixtures/browser/tools.json' with { type: 'json' }

async function protocol(
  run: (context: {
    session: BrowserMcpSession
    server: Server
    tools: typeof observed.tools
    calls: string[]
    abort: AbortController
    state: { text: string; image: boolean; cursor: boolean }
  }) => Promise<void>,
) {
  const [client, remote] = InMemoryTransport.createLinkedPair()
  const server = new Server(observed.server, { capabilities: { tools: { listChanged: true } } })
  const tools = structuredClone(observed.tools),
    calls: string[] = [],
    abort = new AbortController()
  const state = { text: '### Result\nCompleted', image: false, cursor: false }
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
    ...(state.cursor ? { nextCursor: 'same' } : {}),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    calls.push(request.params.name)
    await server.notification({ method: 'notifications/tools/list_changed' })
    return {
      content: state.image
        ? [{ type: 'image' as const, mimeType: 'image/png', data: 'AA==' }]
        : [{ type: 'text' as const, text: state.text }],
    }
  })
  const transport = Object.assign(client, {
    observation: () => {
      throw new Error('Protocol fixtures establish no native process observation')
    },
  })
  const session = new BrowserMcpSession(
    transport,
    abort.signal,
    new Date(Date.now() + 5000).toISOString(),
    () => {},
    128,
  )
  await server.connect(remote)
  try {
    await run({ session, server, tools, calls, abort, state })
  } finally {
    await session.close()
    await server.close()
  }
}
it('rechecks changed tool inventories without replaying an already dispatched UI action', () =>
  protocol(async ({ session, calls, server }) => {
    await session.connect(BROWSER_REFERENCE.digest)
    await server.notification({ method: 'notifications/tools/list_changed' })
    const result = await session.call('browser_navigate', { url: 'http://web:3000/' })
    expect(result.error).toBe(false)
    expect(calls).toEqual(['browser_navigate'])
  }))
it('refuses unsafe tools and invalid arguments before any MCP action', () =>
  protocol(async ({ session, calls }) => {
    await session.connect(BROWSER_REFERENCE.digest)
    await expect(session.call('browser_run_code_unsafe', { code: 'dangerous' })).rejects.toThrow(
      'not-permitted',
    )
    await expect(
      session.call('browser_navigate', { url: 'http://web:3000/', injected: true }),
    ).rejects.toThrow()
    expect(calls).toEqual([])
  }))
it('refuses missing selected tools after notification before dispatch', () =>
  protocol(async ({ session, tools, calls, server }) => {
    await session.connect(BROWSER_REFERENCE.digest)
    tools.pop()
    await server.notification({ method: 'notifications/tools/list_changed' })
    await expect(session.call('browser_snapshot', {})).rejects.toThrow()
    expect(calls).toEqual([])
  }))
it('treats native soft errors as errors rather than successful objective observations', () =>
  protocol(async ({ session, state }) => {
    await session.connect(BROWSER_REFERENCE.digest)
    state.text = '### Error\nTimed out waiting for task'
    expect((await session.call('browser_wait_for', { text: 'task' })).error).toBe(true)
  }))
it('bounds complete text and refuses images from non-capture tools', () =>
  protocol(async ({ session, state }) => {
    await session.connect(BROWSER_REFERENCE.digest)
    state.text = 'x'.repeat(129)
    await expect(session.call('browser_snapshot', {})).rejects.toThrow('output-limit')
    state.image = true
    await expect(session.call('browser_snapshot', {})).rejects.toThrow('output-limit')
  }))
it('refuses repeated inventory cursors rather than accepting incomplete capabilities', () =>
  protocol(async ({ session, state }) => {
    state.cursor = true
    await expect(session.connect(BROWSER_REFERENCE.digest)).rejects.toThrow('pagination')
  }))
it('stops before dispatch when its original signal is cancelled', () =>
  protocol(async ({ session, abort, calls }) => {
    await session.connect(BROWSER_REFERENCE.digest)
    abort.abort()
    await expect(session.call('browser_snapshot', {})).rejects.toThrow('expired')
    expect(calls).toEqual([])
  }))
