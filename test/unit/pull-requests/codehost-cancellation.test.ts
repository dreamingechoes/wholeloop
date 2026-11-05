import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { executeCodehostCommand } from '../../../src/pull-requests/codehost.js'

it('refuses an already cancelled read before spawning its command', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-codehost-cancelled-')),
    marker = join(root, 'started'),
    abort = new AbortController()
  abort.abort()
  try {
    await expect(
      executeCodehostCommand(
        process.execPath,
        ['-e', "require('node:fs').writeFileSync(process.argv[1],'started')", marker],
        root,
        undefined,
        abort.signal,
      ),
    ).rejects.toThrow('cancelled before launch')
    expect(existsSync(marker)).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
it('cancels its original in-memory command and observes closed stdio before rejecting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-codehost-cancel-')),
    marker = join(root, 'started'),
    abort = new AbortController(),
    settled = executeCodehostCommand(
      process.execPath,
      [
        '-e',
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
        marker,
      ],
      root,
      undefined,
      abort.signal,
    ).then(
      () => 'unexpected success',
      () => 'refused',
    )
  try {
    const until = Date.now() + 5000
    while (!existsSync(marker) && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 5))
    expect(existsSync(marker)).toBe(true)
    const pid = Number(readFileSync(marker, 'utf8'))
    abort.abort()
    expect(await settled).toBe('refused')
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
  } finally {
    abort.abort()
    await settled
    rmSync(root, { recursive: true, force: true })
  }
})
