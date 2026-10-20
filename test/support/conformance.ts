/** Supplied report data only: these fixtures never execute or attest a native client. */
export function reportedRegression(core = 'd'.repeat(64), observedAt = '2026-10-20T11:00:00.000Z') {
  return {
    schema: 'wholeloop/conformance-results@1',
    runs: (['pinned', 'latest'] as const).map((channel) => {
      const pin = channel === 'pinned' ? '1.2.3' : '1.2.4'
      return {
        channel,
        observedAt,
        report: {
          schema: 'wholeloop/conformance-report@1',
          id: `cf-${(channel === 'pinned' ? 'a' : 'b').repeat(24)}`,
          cli: 'claude',
          pin,
          step: 'frame-problem',
          evidence: 'live-process-and-journal',
          status: channel === 'pinned' ? 'PASS' : 'FAIL',
          missing: channel === 'pinned' ? [] : ['note.added:installed-skill-marker'],
          problems: [] as string[],
          subject: 'init-01234567',
          process: { status: 'succeeded', code: 0, signal: null, version: pin },
          scenario: 'standalone-frame-v1',
          scenarioDigest: 'c'.repeat(64),
          core,
          source: 'e'.repeat(64),
          limitations: ['Supplied fixture only'],
        },
      }
    }),
  }
}
