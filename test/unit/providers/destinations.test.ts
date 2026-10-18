import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type LoadedProvider, loadProviders } from '../../../src/providers/load.js'
import { validateProvider } from '../../../src/providers/manifest.js'
import {
  type OperationCall,
  type OperationResult,
  performOperation,
  updateDocument,
} from '../../../src/providers/operations.js'
import { RepositoryDocuments } from '../../../src/providers/repo-docs.js'
import { StoreFiles } from '../../../src/state/files.js'

const destinationIds = [
  'github-issues',
  'gitlab-issues',
  'jira',
  'linear',
  'confluence',
  'notion',
  'google-docs',
  'repo-docs',
]
function fixture(run: (dir: string) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-destinations-'))
  return Promise.resolve()
    .then(() => run(dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}
function provider(id: string, dir: string): LoadedProvider {
  const registry = loadProviders({ root: join(dir, 'repo'), user: join(dir, 'user') })
  expect(registry.problems).toEqual([])
  const found = registry.providers.find((entry) => entry.manifest.id === id)
  if (!found) throw new Error(`Missing provider: ${id}`)
  return found
}
function transcript(id: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../fixtures/providers/destinations/${id}.json`, import.meta.url),
      'utf8',
    ),
  ) as {
    provenance: string
    request: { operation: string; tool: string; input: Record<string, unknown> }
    response: OperationResult
    read?: OperationResult
  }
}

describe('destination catalog and fixture transcripts', () => {
  it.each(destinationIds)('%s validates and follows its host-boundary transcript', (id) =>
    fixture(async (dir) => {
      const selected = provider(id, dir)
      const recording = transcript(id)
      expect(recording.provenance).toContain('not a live')
      for (const text of Object.values(selected.guidanceText)) {
        expect(text.trimEnd().split('\n').length).toBeLessThanOrEqual(30)
        expect(text.trim()).not.toBe('')
      }
      let invoked = false
      const result = await performOperation(
        selected,
        recording.request.operation,
        recording.request.input,
        {
          async invoke(call) {
            invoked = true
            expect(call.tool).toBe(recording.request.tool)
            expect(call.guidance).toContain('# ')
            expect(call.args.body).toBe(recording.request.input.body)
            return recording.response
          },
        },
      )
      expect(invoked).toBe(true)
      expect(result.ref).toBe(recording.response.ref)
      if (!recording.read) return
      const calls: OperationCall[] = []
      const read = recording.read
      const update = await updateDocument(
        selected,
        read.ref,
        ({ body }) => `${body}\n## Wholeloop\n\nUpdated definition.\n`,
        {
          async invoke(call) {
            calls.push(call)
            return call.operation === 'docs.read'
              ? read
              : { ...recording.response, revision: 'fixture-revision-2' }
          },
        },
      )
      expect(calls.map((call) => call.operation)).toEqual(['docs.read', 'docs.update'])
      expect(calls[1]?.args).toMatchObject({ ref: read.ref, revision: read.revision })
      expect(calls[1]?.args.body).toContain('Unrelated section stays.')
      expect(update.source.sha256).toHaveLength(64)
      expect(update.result.status).toBe('succeeded')
    }),
  )

  it('preserves bundled guidance through inheritance in an isolated installed-style invocation', () =>
    fixture((dir) => {
      const folder = join(dir, 'repo/.wholeloop/providers/confluence')
      mkdirSync(folder, { recursive: true })
      writeFileSync(
        join(folder, 'provider.json'),
        JSON.stringify({
          schema: 1,
          id: 'confluence',
          extends: 'builtin:confluence',
          description: 'Team Confluence',
        }),
      )
      const selected = provider('confluence', dir)
      expect(selected.guidanceText['docs.update']).toContain('read-modify-write')
      for (const id of destinationIds) {
        const response = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'provider', 'test', id, '--json'],
          {
            cwd: dir,
            env: { ...process.env, XDG_CONFIG_HOME: join(dir, 'config') },
            encoding: 'utf8',
          },
        )
        expect(response.status).toBe(0)
        const output = JSON.parse(response.stdout)
        expect(output.problems).toEqual([])
        expect(output.providers[0].guidanceText).not.toEqual({})
        expect(output.probe).toContain('Not performed')
      }
    }))
})

describe('same-operation document read-modify-write', () => {
  it('rejects update-only manifests and invalid normalized responses', () =>
    fixture(async (dir) => {
      const selected = provider('notion', dir)
      const updateOnly = structuredClone(selected.manifest)
      delete updateOnly.operations['docs.read']
      delete updateOnly.degrade['docs.read']
      expect(() => validateProvider(updateOnly)).toThrow('docs.read')
      await expect(
        performOperation(
          selected,
          'docs.create',
          {},
          {
            async invoke() {
              return { status: 'queued', ref: '' } as unknown as OperationResult
            },
          },
        ),
      ).rejects.toThrow('Invalid normalized provider result')
    }))

  it.each([
    { status: 'pending' },
    { ref: 'another-document' },
    { complete: false },
    { body: undefined },
    { revision: undefined },
  ])('blocks incomplete or mismatched reads: %j', (change) =>
    fixture(async (dir) => {
      const selected = provider('notion', dir)
      const calls: string[] = []
      let transformed = false
      await expect(
        updateDocument(
          selected,
          'page-42',
          () => {
            transformed = true
            return 'Updated'
          },
          {
            async invoke(call) {
              calls.push(call.operation)
              return {
                status: 'succeeded',
                ref: 'page-42',
                body: 'Existing',
                revision: 'v1',
                complete: true,
                ...change,
              } as OperationResult
            },
          },
        ),
      ).rejects.toThrow('complete read')
      expect(calls).toEqual(['docs.read'])
      expect(transformed).toBe(false)
    }),
  )

  it('rejects blind updates, transform failures and read errors without writing', () =>
    fixture(async (dir) => {
      const selected = provider('notion', dir)
      let calls = 0
      const host = {
        async invoke(): Promise<OperationResult> {
          calls++
          throw new Error('Source unavailable')
        },
      }
      await expect(
        performOperation(
          selected,
          'docs.update',
          { ref: 'page-42', body: 'Blind overwrite' },
          host,
        ),
      ).rejects.toThrow('same operation')
      expect(calls).toBe(0)
      await expect(updateDocument(selected, 'page-42', () => 'New', host)).rejects.toThrow(
        'Source unavailable',
      )
      expect(calls).toBe(1)
      await expect(
        updateDocument(
          selected,
          'page-42',
          () => {
            throw new Error('Invalid transformation')
          },
          {
            async invoke() {
              calls++
              return {
                status: 'succeeded',
                ref: 'page-42',
                body: 'Old',
                revision: 'v1',
                complete: true,
              }
            },
          },
        ),
      ).rejects.toThrow('Invalid transformation')
      expect(calls).toBe(2)
    }))

  it('preserves pending writes and skips no-op updates', () =>
    fixture(async (dir) => {
      const selected = provider('notion', dir)
      const calls: OperationCall[] = []
      const host = {
        async invoke(call: OperationCall): Promise<OperationResult> {
          calls.push(call)
          return call.operation === 'docs.read'
            ? { status: 'succeeded', ref: 'page-42', body: 'Old', revision: 'v1', complete: true }
            : { status: 'pending', ref: 'page-42' }
        },
      }
      expect(await updateDocument(selected, 'page-42', ({ body }) => body, host)).toMatchObject({
        changed: false,
      })
      expect(calls).toHaveLength(1)
      expect(await updateDocument(selected, 'page-42', () => 'New', host)).toMatchObject({
        changed: true,
        result: { status: 'pending' },
      })
      expect(calls).toHaveLength(3)
      expect(calls[2]?.args.allow_async).toBe(false)
    }))

  it('binds typed placeholders and prevents callers overriding fixed tool methods', () =>
    fixture(async (dir) => {
      const selected = provider('github-issues', dir)
      selected.manifest.operations['tracker.create-item'] = {
        tool: 'issue_write',
        args: { method: 'create', nested: { id: '{{identifier}}' } },
      }
      await performOperation(
        selected,
        'tracker.create-item',
        { method: 'delete', identifier: 42 },
        {
          async invoke(call) {
            expect(call.args).toMatchObject({ method: 'create', nested: { id: 42 } })
            return { status: 'succeeded', ref: 'issue-42' }
          },
        },
      )
      await expect(
        performOperation(
          selected,
          'tracker.create-item',
          {},
          {
            async invoke() {
              throw new Error('Must not call')
            },
          },
        ),
      ).rejects.toThrow('Missing provider argument')
    }))
})

describe('intentional repository documentation publication', () => {
  it('creates exclusively, preserves existing text and rejects stale revisions', () =>
    fixture(async (dir) => {
      const root = join(dir, 'repo')
      mkdirSync(root)
      const selected = provider('repo-docs', dir)
      const host = new RepositoryDocuments(root, new StoreFiles(join(dir, 'state')))
      await performOperation(
        selected,
        'docs.create',
        { ref: 'docs/spec.md', body: '# Existing\n\nKeep this.\n' },
        host,
      )
      await expect(
        performOperation(selected, 'docs.create', { ref: 'docs/spec.md', body: 'Replace' }, host),
      ).rejects.toThrow('EEXIST')
      const update = await updateDocument(
        selected,
        'docs/spec.md',
        ({ body }) => `${body}\nNew definition.\n`,
        host,
      )
      expect(update.result.status).toBe('succeeded')
      expect(readFileSync(join(root, 'docs/spec.md'), 'utf8')).toContain('Keep this.')
      expect(readdirSync(join(root, 'docs'))).toEqual(['spec.md'])
      await expect(
        updateDocument(
          selected,
          'docs/spec.md',
          () => {
            writeFileSync(join(root, 'docs/spec.md'), 'Concurrent edit')
            return 'Overwrite'
          },
          host,
        ),
      ).rejects.toThrow('revision conflict')
      expect(readFileSync(join(root, 'docs/spec.md'), 'utf8')).toBe('Concurrent edit')
    }))

  it('rejects traversal, unrelated paths and symlink escapes without output writes', () =>
    fixture(async (dir) => {
      const root = join(dir, 'repo')
      mkdirSync(join(root, 'docs'), { recursive: true })
      mkdirSync(join(dir, 'outside'))
      symlinkSync(join(dir, 'outside'), join(root, 'docs/escape'))
      const selected = provider('repo-docs', dir)
      const host = new RepositoryDocuments(root, new StoreFiles(join(dir, 'state')))
      for (const ref of [
        'docs/../README.md',
        '/tmp/spec.md',
        'src/spec.md',
        'docs/escape/spec.md',
        'docs/file.txt',
        'docs\\spec.md',
      ])
        await expect(
          performOperation(selected, 'docs.create', { ref, body: 'Must not write' }, host),
        ).rejects.toThrow()
      expect(existsSync(join(root, 'README.md'))).toBe(false)
      expect(readdirSync(join(dir, 'outside'))).toEqual([])
    }))
})
