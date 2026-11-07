// The browser MCP session that receives real tool responses; results cannot be imported from JSON.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolResultSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Schema } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { BROWSER_REFERENCE, validateBrowserTools } from './browser-reference.js'
import type { BrowserStdioTransport } from './browser-transport.js'
import { AcceptanceError, acceptanceShape } from './contracts.js'

export interface BrowserToolObservation {
  text: string
  error: boolean
  images: { data: string; mimeType: string }[]
  digest: string
}
export type BrowserSessionTransport = Transport & {
  observation(): ReturnType<BrowserStdioTransport['observation']>
}
export interface BrowserToolSession {
  connect(digest: string): Promise<void>
  call(name: string, args: Record<string, unknown>): Promise<BrowserToolObservation>
  close(): Promise<void>
}
/** Only this source-code transport receives actual MCP responses; there is no JSON-result import endpoint. */
export class BrowserMcpSession implements BrowserToolSession {
  private readonly client = new Client({ name: 'wholeloop-browser-acceptance', version: '1' })
  private generation = 0
  private validated = -1
  private binding?: string
  private connected = false
  private tools: { name: string; inputSchema: unknown }[] = []
  private bytes = 0
  constructor(
    readonly transport: BrowserSessionTransport,
    readonly signal: AbortSignal,
    readonly deadline: string,
    readonly current: () => void,
    readonly textLimit = 1024 * 1024,
  ) {
    this.client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      this.generation++
    })
  }
  private guard() {
    this.current()
    if (this.signal.aborted || Date.now() >= Date.parse(this.deadline))
      throw new AcceptanceError('browser-session-changed-or-expired')
  }
  private options() {
    this.guard()
    const timeout = Math.max(1, Date.parse(this.deadline) - Date.now())
    return { signal: this.signal, timeout, maxTotalTimeout: timeout, resetTimeoutOnProgress: false }
  }
  async connect(digest: string) {
    this.guard()
    this.binding = digest
    await this.client.connect(this.transport, this.options())
    this.connected = true
    await this.refresh()
  }
  private async refresh() {
    if (!this.connected || !this.binding) throw new AcceptanceError('browser-session-unbound')
    if (this.validated === this.generation) return
    // Startup registration may notify after initialize. Re-observe schemas only;
    // an already issued UI action is never replayed during negotiation.
    for (let attempt = 0; attempt < 3; attempt++) {
      const generation = this.generation,
        tools: { name: string; inputSchema: unknown }[] = []
      let cursor: string | undefined,
        complete = false
      const seen = new Set<string>()
      for (let page = 0; page < 4; page++) {
        const result = await this.client.listTools(cursor ? { cursor } : {}, this.options())
        if (Buffer.byteLength(JSON.stringify(result)) > 512 * 1024)
          throw new AcceptanceError('browser-tool-inventory-limit')
        tools.push(...result.tools)
        if (!result.nextCursor) {
          complete = true
          break
        }
        if (seen.has(result.nextCursor)) throw new AcceptanceError('browser-tool-pagination')
        seen.add(result.nextCursor)
        cursor = result.nextCursor
      }
      if (!complete) throw new AcceptanceError('browser-tool-inventory-incomplete')
      validateBrowserTools(this.client.getServerVersion(), tools, this.binding)
      if (generation === this.generation) {
        this.tools = tools
        this.validated = generation
        return
      }
    }
    throw new AcceptanceError('browser-tool-inventory-unstable')
  }
  async call(name: string, args: Record<string, unknown>): Promise<BrowserToolObservation> {
    this.guard()
    await this.refresh()
    const pinned = BROWSER_REFERENCE.tools.find((t) => t.name === name)
    const tool = this.tools.find((t) => t.name === name)
    if (!pinned || !tool) throw new AcceptanceError('browser-tool-not-permitted')
    acceptanceShape(args, tool.inputSchema as Schema)
    const result = CallToolResultSchema.parse(
      await this.client.callTool({ name, arguments: args }, CallToolResultSchema, this.options()),
    )
    this.guard()
    await this.refresh()
    const parts: string[] = [],
      images: BrowserToolObservation['images'] = []
    for (const content of result.content) {
      if (content.type === 'text') parts.push(content.text)
      else if (content.type === 'image')
        images.push({ data: content.data, mimeType: content.mimeType })
      else throw new AcceptanceError('unsupported-browser-output')
    }
    const text = parts.join('\n')
    this.bytes += Buffer.byteLength(text)
    if (
      this.bytes > this.textLimit ||
      images.length > 1 ||
      (images.length && name !== 'browser_take_screenshot')
    )
      throw new AcceptanceError('browser-output-limit')
    return {
      text,
      error: result.isError === true || /^### Error(?:\n|$)/m.test(text),
      images,
      digest: contractDigest(result),
    }
  }
  observation() {
    return this.transport.observation()
  }
  async close() {
    await this.client.close()
    this.connected = false
  }
}
