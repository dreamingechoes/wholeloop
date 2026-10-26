import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AcceptanceHost } from '../../../src/acceptance/store.js'
import { observedDockerSuiteCommand } from '../../../src/acceptance/suite-observation.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { workerProcess } from '../../../src/fanout/process.js'
import { acceptanceFixture } from '../../support/acceptance.js'

const round = { run: 'run-0123456789abcdef', round: 1 },
  ref = 'package.json#check',
  key = `suite-${contractDigest({ round, ref }).slice(0, 40)}`
async function setup(
  run: (
    fixture: Parameters<Parameters<typeof acceptanceFixture>[0]>[0] & {
      digest: string
      host: AcceptanceHost
    },
  ) => Promise<void>,
  options: { code?: number; host?: string } = {},
) {
  await acceptanceFixture(async (fixture) => {
    const test = fixture.plan.cases[0]
    if (!test) throw new Error('Fixture case missing')
    test.runner = {
      kind: 'cli',
      capability: 'process.exec',
      input: JSON.stringify({
        schema: 'wholeloop/behavior-input@1',
        kind: 'cli',
        service: 'web',
        command: 'suite',
      }),
    }
    test.assertions = [
      {
        id: 'exit',
        description: 'The declared command exits zero.',
        subject: 'exit',
        operator: 'equals',
        expected: '0',
      },
    ]
    const digest = fixture.acceptance.prepare(fixture.plan).digest,
      code = options.code ?? 0,
      host: AcceptanceHost = {
        id: options.host ?? 'docker-behavior',
        version: '1',
        capability: 'process.exec',
        provenance: 'fixture',
        execute: async (_test, context) => {
          fixture.calls.count++
          const script = `process.stdout.write('Observed café\\r\\n');process.exitCode=${code}`,
            startedAt = new Date().toISOString(),
            output: Buffer[] = []
          let pid = 0
          const observed = await workerProcess(process.execPath, ['-e', script], {
              cwd: fixture.root,
              env: { PATH: process.env.PATH, HOME: fixture.dir },
              input: '',
              timeoutMs: 1000,
              signal: context.signal,
              started: (value) => {
                pid = value
              },
              observe: (stream, bytes) => {
                if (stream === 'stdout') output.push(Buffer.from(bytes))
              },
            }),
            endedAt = new Date().toISOString()
          const artifact = context.capture(
            Buffer.from(
              JSON.stringify({
                observation: {
                  requests: [],
                  application: {
                    code: observed.code,
                    stdout: Buffer.concat(output).toString('utf8'),
                    stderr: '',
                  },
                },
              }),
            ),
            'application/json',
          )
          return {
            status: code === 0 ? 'passed' : 'failed',
            origin: 'controller-observation',
            invocationState: 'stopped',
            assertions: [
              { id: 'exit', status: code === 0 ? 'passed' : 'failed', evidence: artifact },
            ],
            artifacts: [artifact],
            process: {
              argv: [process.execPath, '-e', script],
              cwd: fixture.root,
              startedAt,
              endedAt,
              pid,
              ...(observed.code !== null ? { code: observed.code } : {}),
            },
            reason: 'Normalized fixture command observation, not actual process certification.',
          }
        },
      }
    await fixture.acceptance.executeCase(digest, test.id, key, fixture.boundary, host)
    await run({ ...fixture, digest, host })
  })
}
describe('exact read-only recovery of an original Docker suite command', () => {
  it.each([0, 7])(
    'preserves exit %i and exact Unicode/newline bytes without executing again',
    async (code) => {
      await setup(
        async ({ acceptance, digest, calls }) => {
          const observed = observedDockerSuiteCommand(acceptance, digest, round, ref, 'find-title')
          expect(observed.receipt).toMatchObject({
            ref,
            exitCode: code,
            signal: '',
            stdout: createHash('sha256').update('Observed café\r\n').digest('hex'),
          })
          expect(observed.output.stdout).toBe('Observed café\r\n')
          expect(observed.result.provenance).toBe('fixture')
          expect(observedDockerSuiteCommand(acceptance, digest, round, ref, 'find-title')).toEqual(
            observed,
          )
          expect(calls.count).toBe(1)
        },
        { code },
      )
    },
  )
  it('cannot substitute a later round or different command for the original key', async () => {
    await setup(async ({ acceptance, digest, calls }) => {
      expect(() =>
        observedDockerSuiteCommand(acceptance, digest, { ...round, round: 2 }, ref, 'find-title'),
      ).toThrow()
      expect(() =>
        observedDockerSuiteCommand(acceptance, digest, round, 'package.json#test', 'find-title'),
      ).toThrow()
      expect(calls.count).toBe(1)
    })
  })
  it('refuses another observation host instead of treating its result as Docker execution', async () => {
    await setup(
      async ({ acceptance, digest }) => {
        expect(() =>
          observedDockerSuiteCommand(acceptance, digest, round, ref, 'find-title'),
        ).toThrow('suite-observation-unavailable')
      },
      { host: 'another-fixture-host' },
    )
  })
  it('refuses altered captured evidence without another execution', async () => {
    await setup(async ({ acceptance, digest, calls }) => {
      const observed = observedDockerSuiteCommand(acceptance, digest, round, ref, 'find-title'),
        artifact = acceptance.artifacts.read(acceptance.get(digest).plan.run, observed.artifact),
        chunk = artifact.artifact.chunks[0]
      if (!chunk) throw new Error('Fixture capture missing')
      writeFileSync(acceptance.planning.sources.files.path(chunk.ref), 'Changed original evidence.')
      expect(() =>
        observedDockerSuiteCommand(acceptance, digest, round, ref, 'find-title'),
      ).toThrow()
      expect(calls.count).toBe(1)
    })
  })
})
