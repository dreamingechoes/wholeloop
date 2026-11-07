// Release-note drafts from Conventional Commits and the version change each range requires.
import { hasToolAttribution, parseConventionalSubject } from '../git/commit.js'

export interface ReleaseCommit {
  sha: string
  message: string
}
const commitId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
type NoteCommit = { sha: string } & NonNullable<ReturnType<typeof parseConventionalSubject>>
export function isReleaseVersion(version: string) {
  const match =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    )
  return (
    version.length <= 128 &&
    !!match &&
    !match[1]
      ?.split('.')
      .some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))
  )
}
const markdownText = (text: string) =>
  text.replace(/\p{Cc}/gu, ' ').replace(/[\\`*_[\]<>|]/g, (character) => `\\${character}`)

/**
 * The smallest version change a range's impact allows (P7-07, ADR-0068).
 * Breaking changes need a new major version, features at least a minor one.
 * A pre-release of the same core as the previous release is still that
 * release in progress, so any change is allowed until it is final; before
 * 1.0.0 a breaking change needs a new minor version, as semantic versioning
 * reserves 0.y.z for initial development.
 */
export function versionBump(
  previous: string,
  next: string,
  impact: 'major' | 'minor' | 'patch' | 'none',
) {
  const core = (value: string) => (value.split(/[-+]/)[0] ?? '').split('.').map(Number)
  if (!isReleaseVersion(previous) || !isReleaseVersion(next))
    throw new Error('Compare two semantic release versions')
  const [pMajor = 0, pMinor = 0, pPatch = 0] = core(previous)
  const [nMajor = 0, nMinor = 0, nPatch = 0] = core(next)
  const rank = { patch: 1, minor: 2, major: 3 } as const
  const required: keyof typeof rank =
    impact === 'major' ? (pMajor === 0 ? 'minor' : 'major') : impact === 'minor' ? 'minor' : 'patch'
  const actual = nMajor > pMajor ? 'major' : nMinor > pMinor ? 'minor' : 'patch'
  const order = nMajor - pMajor || nMinor - pMinor || nPatch - pPatch
  const reason =
    order < 0
      ? 'The next version is lower than the previous release'
      : order === 0
        ? // Only a pre-release cycle may continue on the same core version.
          previous.includes('-') && next !== previous
          ? undefined
          : 'The next version does not follow the previous release'
        : rank[actual] < rank[required]
          ? `A ${impact} change needs at least a ${required} version change`
          : undefined
  return { previous, required, allowed: !reason, ...(reason ? { reason } : {}) }
}

/** Bodies determine breaking intent but never enter release prose or stored drafts. */
export function releaseNotes(
  commits: readonly ReleaseCommit[],
  version: string,
  options: { previous?: string } = {},
) {
  if (commits.length > 1000 || !isReleaseVersion(version))
    throw new Error('Use a bounded committed range and a semantic release version')
  const seen = new Set<string>()
  const accepted: NoteCommit[] = []
  const rejected: { sha: string; reason: string }[] = []
  for (const commit of commits) {
    if (
      !commitId.test(commit.sha) ||
      typeof commit.message !== 'string' ||
      Buffer.byteLength(commit.message) > 65536 ||
      seen.has(commit.sha)
    )
      throw new Error('Invalid, oversized or duplicate release commit; contents omitted')
    seen.add(commit.sha)
    const subject = commit.message.split(/\r?\n/)[0] ?? ''
    const parsed = parseConventionalSubject(subject)
    if (!parsed || hasToolAttribution(subject)) {
      rejected.push({
        sha: commit.sha,
        reason: hasToolAttribution(subject) ? 'tool-attribution' : 'non-conventional-subject',
      })
      continue
    }
    accepted.push({
      sha: commit.sha,
      ...parsed,
      breaking:
        parsed.breaking || /^(?:BREAKING CHANGE|BREAKING-CHANGE):\s+\S/m.test(commit.message),
    })
  }
  const section = (commit: (typeof accepted)[number]) =>
    commit.breaking
      ? 'Breaking changes'
      : commit.type === 'feat'
        ? 'Features'
        : commit.type === 'fix'
          ? 'Fixes'
          : commit.type === 'perf'
            ? 'Performance'
            : commit.type === 'docs'
              ? 'Documentation'
              : 'Maintenance'
  const groups = [
    'Breaking changes',
    'Features',
    'Fixes',
    'Performance',
    'Documentation',
    'Maintenance',
  ]
    .map((title) => ({ title, commits: accepted.filter((commit) => section(commit) === title) }))
    .filter((group) => group.commits.length)
  const markdown = [
    `# Release ${version}`,
    '',
    ...groups.flatMap((group) => [
      `## ${group.title}`,
      '',
      ...group.commits.map(
        (commit) =>
          `- ${commit.scope ? `**${markdownText(commit.scope)}:** ` : ''}${markdownText(commit.description)} (${commit.sha.slice(0, 7)})`,
      ),
      '',
    ]),
    ...(rejected.length
      ? [
          '## Needs review',
          '',
          ...rejected.map((commit) => `- ${commit.sha.slice(0, 7)}: ${commit.reason}`),
          '',
        ]
      : []),
    ...(!commits.length ? ['No changes in the selected committed range.', ''] : []),
  ].join('\n')
  if (hasToolAttribution(markdown)) throw new Error('Release notes contain forbidden attribution')
  const impact = accepted.some((commit) => commit.breaking)
    ? 'major'
    : accepted.some((commit) => commit.type === 'feat')
      ? 'minor'
      : accepted.some((commit) => ['fix', 'perf', 'revert'].includes(commit.type))
        ? 'patch'
        : 'none'
  const bump = options.previous ? versionBump(options.previous, version, impact) : undefined
  return {
    schema: 'wholeloop/release-notes@1',
    version,
    // An insufficient version change is reviewed like a rejected commit: it cannot be prepared.
    status: rejected.length || bump?.allowed === false ? 'needs-review' : 'draft',
    publication: 'not-performed',
    impact,
    ...(bump ? { bump } : {}),
    count: accepted.length,
    groups,
    rejected,
    markdown,
    limitations: [
      'Commit classifications are declarations, not a verification of runtime compatibility.',
      'This draft changes no version, tag, file, release or publication. Review breaking intent and the exact range before publishing.',
    ],
  }
}
