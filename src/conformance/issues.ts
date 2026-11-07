// Projects conformance regressions into issue drafts from named structural evidence.
import { conformanceMatrix } from './matrix.js'

/** Project only named structural evidence; delivery and report authentication belong to the host. */
export function conformanceIssues(input: unknown, asOf: string) {
  const matrix = conformanceMatrix(input, asOf)
  const issues = matrix.regressionCandidates.map((candidate) => {
    const baseline = matrix.rows.find(
      (row) => row.cli === candidate.cli && row.channel === 'pinned',
    )
    const latest = matrix.rows.find((row) => row.cli === candidate.cli && row.channel === 'latest')
    const marker = `<!-- wholeloop:conformance-regression:${candidate.key} -->`
    return {
      key: candidate.key,
      cli: candidate.cli,
      core: candidate.core,
      title: `conformance: ${candidate.cli} ${candidate.latest} fails standalone framing`,
      body: [
        marker,
        '',
        `The pinned ${candidate.cli} version passed standalone framing; the latest version completed its native process but failed structural assertions.`,
        '',
        `- Pinned version: ${candidate.baseline}`,
        `- Latest version: ${candidate.latest}`,
        `- Pinned observation: ${baseline?.observedAt}`,
        `- Latest observation: ${latest?.observedAt}`,
        `- Pinned run: ${candidate.baselineRun}`,
        `- Latest run: ${candidate.latestRun}`,
        '',
        'Failing assertions:',
        '',
        ...candidate.assertions.map((assertion) => `- ${assertion}`),
        '',
        `Scenario: ${candidate.scenario}`,
        `Scenario digest: ${candidate.scenarioDigest}`,
        `Core digest: ${candidate.core}`,
        `Canonical source digest: ${candidate.source}`,
        '',
        'This is a reported process/journal regression candidate. It does not establish native hook, permission, MCP or semantic-quality conformance.',
        '',
      ].join('\n'),
    }
  })
  return {
    schema: 'wholeloop/conformance-issues@1',
    asOf,
    status: 'draft',
    issues,
    effects: 'not-performed',
    limitations: [
      'Drafts do not authenticate imported reports or authorize issue creation.',
      'Only fresh comparable standalone-framing candidates are included; launch/authentication failures are not version regressions.',
      'Delivery must check intact stable markers in open and closed issues and serialize its writers.',
    ],
  }
}
