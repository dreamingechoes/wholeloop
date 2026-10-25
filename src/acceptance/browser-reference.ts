import { contractDigest } from '../contracts/compatibility.js'
import reference from './browser-reference.json' with { type: 'json' }
import { AcceptanceError } from './contracts.js'

export const BROWSER_REFERENCE = reference
export const BROWSER_REFERENCE_IMAGES = {
  arm64:
    'mcr.microsoft.com/playwright/mcp@sha256:a231d1ae1426ed33ac60ae28bfab5373ac1651786aa33011477d65b92a16d587',
  amd64:
    'mcr.microsoft.com/playwright/mcp@sha256:a137939759d82dc76da973ce52be3f89e2e4b1804c0634454e82b8a1af46e986',
} as const
export const BROWSER_PROBE_PORT = 8931
export const BROWSER_KEEPALIVE =
  "const net=require('node:net');net.createServer(s=>s.end('ready')).listen(8931,'127.0.0.1')"
export function browserReferenceCommand(appOrigin: string) {
  if (!/^http:\/\/[a-z][a-z0-9_-]{0,63}:\d{1,5}$/.test(appOrigin))
    throw new AcceptanceError('invalid-browser-reference-origin')
  return [
    'node',
    '/app/cli.js',
    '--headless',
    '--browser',
    'chromium',
    '--no-sandbox',
    '--isolated',
    '--no-webmcp',
    '--output-dir',
    '/tmp/wholeloop-browser',
    '--timeout-action',
    '3000',
    '--timeout-navigation',
    '10000',
    '--timeout-settle',
    '0',
    '--snapshot-mode',
    'full',
    '--block-service-workers',
    '--allowed-origins',
    appOrigin,
  ]
}
function constraints(value: unknown, names = false): unknown {
  if (Array.isArray(value)) return value.map((entry) => constraints(entry))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => names || !['description', 'title', '$schema', '$comment'].includes(key))
        .map(([key, entry]) => [
          key,
          constraints(
            entry,
            !names &&
              [
                'properties',
                '$defs',
                'definitions',
                'patternProperties',
                'dependentSchemas',
              ].includes(key),
          ),
        ]),
    )
  return value
}
/** Bind all validation constraints. Prose descriptions cannot add executable capabilities. */
export function browserToolContract(tool: { name: string; inputSchema: unknown }) {
  return contractDigest(constraints({ name: tool.name, inputSchema: tool.inputSchema }))
}
export function validateBrowserTools(
  server: unknown,
  tools: { name: string; inputSchema: unknown }[],
  digest: string,
) {
  if (
    digest !== reference.digest ||
    contractDigest(server) !== contractDigest(reference.server) ||
    tools.length > 256 ||
    new Set(tools.map((t) => t.name)).size !== tools.length
  )
    throw new AcceptanceError('browser-host-binding')
  for (const pinned of reference.tools) {
    const observed = tools.find((t) => t.name === pinned.name)
    if (!observed || browserToolContract(observed) !== pinned.digest)
      throw new AcceptanceError('browser-tool-unavailable-or-changed')
  }
}
