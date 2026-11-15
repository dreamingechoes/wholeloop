// Commit-message rules shared by the commit hook, CI and release notes, so all three judge a
// subject the same way.
const SUBJECT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9./-]*\))?!?: ([a-z0-9].*)$/
// GitHub appends " (#N)" to the pull request title when it squash-merges, so a
// title that met the limit lands on main over it. The limit is on what the
// author writes; counting the suffix rejected three merged release commits as
// non-conventional, which stops release notes. Rejected: requiring titles of 66
// characters or fewer, which cannot repair commits already on main.
const MERGE_SUFFIX = / \(#[1-9][0-9]*\)$/
const TOOL =
  /\b(ai|claude|anthropic|codex|openai|copilot|cursor|gemini|gpt|opencode|antigravity|assistant|chatgpt|aider|devin|augment|windsurf|bot)\b/i

/** Commit hygiene and release classification share the existing subject grammar. */
export function parseConventionalSubject(subject: string) {
  const match = SUBJECT.exec(subject)
  const written = subject.replace(MERGE_SUFFIX, '')
  if (
    !match?.[1] ||
    !match[3] ||
    written.length > 72 ||
    written.endsWith('.') ||
    match[3] !== match[3].toLowerCase()
  )
    return undefined
  return {
    type: match[1],
    scope: match[2]?.slice(1, -1),
    description: match[3],
    breaking: subject.slice(0, subject.indexOf(': ')).endsWith('!'),
  }
}

/** Validate the message without rewriting authorship or silently fixing history. */
export function checkCommit(message: string): string[] {
  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const subject = lines[0] ?? ''
  const problems: string[] = []
  if (!parseConventionalSubject(subject)) {
    problems.push(
      'Use a lowercase Conventional Commit subject of at most 72 characters, e.g. feat(core): add state replay (no trailing period).',
    )
  }
  if (lines[1]?.trim()) problems.push('Separate the subject and body with a blank line.')
  if (!lines.slice(2).some((line) => line.trim() && !line.startsWith('#'))) {
    problems.push('Add a body explaining why the change is needed and what was verified.')
  }
  if (hasToolAttribution(message))
    problems.push('Remove tool attribution from the commit message (ADR-0017).')
  if (message.includes('`') || message.includes('$(')) {
    problems.push('Do not use backticks or shell command substitutions in commit messages.')
  }
  return [...new Set(problems)]
}

/** Shared by commits and PR drafts so publication cannot weaken authorship policy. */
export function hasToolAttribution(message: string): boolean {
  return message
    .split(/\r?\n/)
    .some(
      (line) =>
        (/^\s*co-authored-by\s*:/i.test(line) && TOOL.test(line)) ||
        /\b(generated|made)\s+(with|by)\b/i.test(line) ||
        (/\b(written|authored) by\b/i.test(line) && TOOL.test(line)),
    )
}
