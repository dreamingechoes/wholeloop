import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AssemblyGitProcess } from '../../../src/integration/git-process.js'
import { StoreFiles } from '../../../src/state/files.js'

it('retains actual closed native Git ownership and refuses a second dispatch or changed receipt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-assembly-process-'))
  try {
    const files = new StoreFiles(join(dir, 'store')),
      operation = new AssemblyGitProcess(files, 'delivery/assembly-process-fixture'),
      args = ['--version']
    await operation.invoke(
      dir,
      args,
      new Date(Date.now() + 10000).toISOString(),
      new AbortController().signal,
      () => {},
    )
    expect(operation.observe(args, dir)).toMatchObject({ code: 0, invocationState: 'stopped' })
    expect(operation.observe(['status'], dir)).toBeUndefined()
    await expect(
      operation.invoke(
        dir,
        args,
        new Date(Date.now() + 10000).toISOString(),
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('already-dispatched')
    const path = files.path('delivery/assembly-process-fixture/outcome.json'),
      outcome = JSON.parse(readFileSync(path, 'utf8'))
    outcome.nonce = 'unrelated'
    writeFileSync(path, JSON.stringify(outcome))
    expect(operation.observe(args, dir)).toBeUndefined()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('pins the narrower controller deadline and registers its actual wrapper before input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-controlled-git-'))
  try {
    const files = new StoreFiles(join(dir, 'store')),
      operation = new AssemblyGitProcess(files, 'delivery/controlled'),
      deadline = new Date(Date.now() + 5000).toISOString()
    let observed = false
    await operation.invoke(
      dir,
      ['--version'],
      new Date(Date.now() + 15000).toISOString(),
      new AbortController().signal,
      () => {},
      {
        deadline,
        signal: new AbortController().signal,
        current: () => true,
        started: (runtime) => {
          const started = JSON.parse(
            readFileSync(files.path('delivery/controlled/started.json'), 'utf8'),
          )
          expect(started.pid).toBe(runtime.pid)
          expect(started.operation).toBe(runtime.operation)
          expect(
            JSON.parse(readFileSync(files.path('delivery/controlled/intent.json'), 'utf8'))
              .deadline,
          ).toBe(deadline)
          observed = true
        },
      },
    )
    expect(observed).toBe(true)
    expect(operation.observe(['--version'], dir)).toMatchObject({
      code: 0,
      invocationState: 'stopped',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it.each(['expired', 'aborted', 'fenced'] as const)(
  'refuses %s controller control before native intent',
  async (mode) => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-controlled-git-'))
    try {
      const files = new StoreFiles(join(dir, 'store')),
        operation = new AssemblyGitProcess(files, 'delivery/controlled'),
        abort = new AbortController()
      if (mode === 'aborted') abort.abort()
      await expect(
        operation.invoke(
          dir,
          ['--version'],
          new Date(Date.now() + 15000).toISOString(),
          new AbortController().signal,
          () => {},
          {
            deadline: new Date(Date.now() + (mode === 'expired' ? -1 : 5000)).toISOString(),
            signal: abort.signal,
            current: () => mode !== 'fenced',
          },
        ),
      ).rejects.toThrow(
        mode === 'aborted' ? 'assembly-operation-deadline' : 'assembly-controller-fenced',
      )
      expect(existsSync(files.path('delivery/controlled/intent.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)
