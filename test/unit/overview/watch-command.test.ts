import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { watchCommand } from '../../../src/cli/watch.js'

it.each([
  { code: 'EPIPE', exit: 0 },
  { code: 'EIO', exit: 1 },
])(
  'classifies a synchronous $code output failure without recursively writing a store problem',
  async ({ code, exit }) => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-watch-output-'))
    vi.stubEnv('XDG_STATE_HOME', join(root, 'state'))
    vi.stubEnv('XDG_CONFIG_HOME', join(root, 'config'))
    vi.stubEnv('WL_WORKSPACE', '')
    const out = vi.fn(() => {
        throw Object.assign(new Error('Synthetic output failure'), { code })
      }),
      cancelOutput = vi.fn(),
      before = process.stdout.listenerCount('error')
    try {
      expect(
        await watchCommand({ positional: [], options: { '--poll': true } }, root, {
          out,
          err: vi.fn(),
          cancelOutput,
        }),
      ).toBe(exit)
      expect(out).toHaveBeenCalledTimes(1)
      expect(cancelOutput).toHaveBeenCalledTimes(1)
      expect(process.stdout.listenerCount('error')).toBe(before)
    } finally {
      vi.unstubAllEnvs()
      rmSync(root, { recursive: true, force: true })
    }
  },
)
