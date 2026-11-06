import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { StoreFiles } from '../../../src/state/files.js'
import { withReadObservation } from '../../../src/state/read-observation.js'

async function fixture(
  run: (files: StoreFiles, manager: ManagedRunnerProcess) => void | Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-cancellation-writes-'))
  const files = new StoreFiles(join(root, 'state'))
  const manager = new ManagedRunnerProcess(files, 'a'.repeat(64))
  files.atomic(
    `${manager.relative}/intent.json`,
    JSON.stringify({
      invocation: manager.invocation,
      nonce: 'original-nonce',
      cwd: root,
      command: 'b'.repeat(64),
      deadline: '2026-11-06T01:00:00.000Z',
    }),
  )
  try {
    await run(files, manager)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('fresh nonce-bound cancellation publication', () => {
  it('republishes removed, foreign and corrupt requests instead of caching cancellation', () =>
    fixture((files, manager) => {
      const relative = `${manager.relative}/cancel.json`
      const path = files.path(relative)
      manager.requestCancellation()
      for (const content of [
        undefined,
        '{',
        JSON.stringify({ nonce: 'foreign' }),
        'x'.repeat(65537),
      ]) {
        if (content === undefined) rmSync(path)
        else files.atomic(relative, content)
        manager.requestCancellation()
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ nonce: 'original-nonce' })
      }
    }))
  it('refuses a duplicate write attempt inside a read observation before any filesystem mutation', () =>
    fixture(async (files, manager) => {
      manager.requestCancellation()
      const atomic = vi.spyOn(files, 'atomic')
      await expect(
        withReadObservation(new AbortController().signal, async () => {
          manager.requestCancellation()
        }),
      ).rejects.toThrow('Read observation')
      expect(atomic).not.toHaveBeenCalled()
    }))
  it.each([100, 400])(
    'publishes %i repeated requests only once while still checking registration',
    (count) =>
      fixture((files, manager) => {
        const atomic = vi.spyOn(files, 'atomic')
        for (let index = 0; index < count; index++) manager.requestCancellation()
        const writes = atomic.mock.calls.filter(
          ([path]) => path === `${manager.relative}/cancel.json`,
        ).length
        expect(
          JSON.parse(readFileSync(files.path(`${manager.relative}/cancel.json`), 'utf8')),
        ).toEqual({ nonce: 'original-nonce' })
        expect(writes).toBe(1)
        files.atomic(`${manager.relative}/started.json`, JSON.stringify({ nonce: 'changed' }))
        expect(() => manager.requestCancellation()).toThrow('changed-native-registration')
      }),
  )
})
