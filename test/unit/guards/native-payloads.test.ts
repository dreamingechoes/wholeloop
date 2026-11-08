// P3-08: before-tool payloads captured from real tier-A clients on 2026-11-08 (paths and
// identifiers redacted) must normalize to the same event, whatever each client's shape.
// Codex reads through its shell, so its read is a shell event rather than a read event.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeTool } from '../../../src/guards/normalize.js'

const root = '/workspace/project'
type Captured = { version: string; read: unknown; write: unknown; shell: unknown }
const captured: Record<'claude' | 'codex' | 'copilot' | 'opencode', Captured> = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../fixtures/hooks/tier-a-payloads.json'), 'utf8'),
)
// The OpenCode plugin receives tool and input and forwards them as the core's own payload.
const payload = (client: keyof typeof captured, event: 'read' | 'write' | 'shell') => {
  const value = captured[client][event] as { tool: string; input: unknown }
  return client === 'opencode'
    ? { event: 'before-tool', tool: value.tool, args: value.input, cwd: root }
    : value
}

describe('captured tier-A hook payloads', () => {
  it.each(['claude', 'codex', 'copilot', 'opencode'] as const)(
    '%s read, write and shell normalize to the same events',
    (client) => {
      expect(normalizeTool(payload(client, 'read'), root)).toMatchObject(
        client === 'codex'
          ? { event: 'before-tool', cwd: root, kind: 'shell', command: 'cat README.md' }
          : { event: 'before-tool', cwd: root, kind: 'read' },
      )
      expect(normalizeTool(payload(client, 'write'), root)).toEqual({
        event: 'before-tool',
        cwd: root,
        kind: 'write',
        paths: [`${root}/notes.txt`],
      })
      expect(normalizeTool(payload(client, 'shell'), root)).toEqual({
        event: 'before-tool',
        cwd: root,
        kind: 'shell',
        command: 'git status',
        paths: [],
      })
    },
  )
})
