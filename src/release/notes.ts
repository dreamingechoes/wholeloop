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

/** Bodies determine breaking intent but never enter release prose or stored drafts. */
export function releaseNotes(commits: readonly ReleaseCommit[], version: string) {
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
  return {
    schema: 'wholeloop/release-notes@1',
    version,
    status: rejected.length ? 'needs-review' : 'draft',
    publication: 'not-performed',
    impact,
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
