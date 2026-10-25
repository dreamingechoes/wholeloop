import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
