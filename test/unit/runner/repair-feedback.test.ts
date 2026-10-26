import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import {
  knownSuiteFailure,
  repairFailureFingerprint,
  runnerRepairFeedback,
} from '../../../src/runner/repair-feedback.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { runnerSuiteFixture as setup } from '../../support/runner-suite.js'

const finding = {
  unit: 'contracts/search-api',
  id: 'first-model-id',
  location: 'contract.txt:1',
  text: 'The title query loses duplicate title matches.',
  evidence: ['observed duplicate IDs', 'contract: title-query-v1'],
}
const fingerprint = (findings = [finding]) =>
  repairFailureFingerprint({
    category: 'verification-findings',
    unit: 'contract',
    commands: [],
    findings,
  })
describe('original failure feedback before repair', () => {
  it('does not count model IDs, ordering or whitespace as progress', () => {
    const other = {
      ...finding,
      id: 'other',
      location: 'contract.txt:2',
      text: 'The empty title case is unspecified.',
    }
    expect(fingerprint([finding, other])).toBe(
      fingerprint([
        { ...other, id: 'new-other-model-id' },
        {
          ...finding,
          id: 'different-model-id',
          text: '  The title query loses\n duplicate title matches. ',
          evidence: [...finding.evidence].reverse(),
        },
      ]),
    )
  })
  it('distinguishes changed retained substance and independent work units', () => {
    expect(fingerprint()).not.toBe(
      fingerprint([{ ...finding, text: 'The title query accepts an invalid operator.' }]),
    )
    expect(fingerprint()).not.toBe(
      repairFailureFingerprint({
        category: 'verification-findings',
        unit: 'another-unit',
        commands: [],
        findings: [finding],
      }),
    )
  })
  it('keeps actual nonzero command identities and observed diagnostic hashes in the fingerprint', () => {
    const command = {
        ref: 'package.json#check',
        exitCode: 7,
        signal: '',
        diagnostic: 'a'.repeat(64),
      },
      input = {
        category: 'suite-failure' as const,
        unit: 'search',
        commands: [command],
        findings: [],
      }
    expect(repairFailureFingerprint(input)).not.toBe(
      repairFailureFingerprint({ ...input, commands: [{ ...command, exitCode: 1 }] }),
    )
    expect(repairFailureFingerprint(input)).not.toBe(
      repairFailureFingerprint({
        ...input,
        commands: [{ ...command, diagnostic: 'b'.repeat(64) }],
      }),
    )
  })
  it.each([
    { exitCode: 7, signal: '', expected: true },
    { exitCode: 0, signal: '', expected: false },
    { exitCode: -1, signal: '', expected: false },
    { exitCode: 7, signal: 'SIGTERM', expected: false },
    { exitCode: 256, signal: '', expected: false },
  ])(
    'keeps interruptions and missing exits distinct from a known code failure: %j',
    ({ exitCode, signal, expected }) => {
      expect(
        knownSuiteFailure([
          { ref: 'package.json#check', exitCode, signal, diagnostic: 'a'.repeat(64) },
        ]),
      ).toBe(expected)
    },
  )
  it('rejects a result-shaped object instead of accepting a supplied observation', async () => {
    await setup(async ({ store, context }) => {
      const record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture root stage missing')
      const fake = {
        inspect: () => {
          throw new Error('Untrusted objects cannot supply original QA')
        },
      } as unknown as RunnerVerificationStages
      expect(await runnerRepairFeedback(fake, context.request, record)).toMatchObject({
        status: 'unavailable',
        repairDispatch: 'not-authorized',
        limits: 'unchanged',
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it.each(['missing', 'corrupt', 'wrong-request'] as const)(
    'retains %s original evidence without launching a verifier or authorizing repair',
    async (mode) => {
      await setup(async ({ store, context, engine, driver }) => {
        const record = store.stage(contractDigest(context.request), context.stage.id)
        if (!record) throw new Error('Fixture root stage missing')
        if (mode === 'corrupt')
          store.files.atomic(
            `delivery/runner-verifications/${context.invocation}.json`,
            'Incomplete original binding.\n',
          )
        const reader = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          driver,
          suite: () => {
            throw new Error('Classification cannot select a suite')
          },
          gate: () => {
            throw new Error('Classification cannot launch a verifier')
          },
        })
        const request =
          mode === 'wrong-request' ? { ...context.request, plan: 'f'.repeat(64) } : context.request
        expect(await runnerRepairFeedback(reader, request, record)).toMatchObject({
          status: 'unavailable',
          repairDispatch: 'not-authorized',
          limits: 'unchanged',
        })
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      })
    },
  )
})
