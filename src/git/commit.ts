// Commit-message rules shared by the commit hook, CI and release notes, so all three judge a
// subject the same way.
const SUBJECT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9./-]*\))?!?: ([a-z0-9].*)$/
const TOOL =
  /\b(ai|claude|anthropic|codex|openai|copilot|cursor|gemini|gpt|opencode|antigravity|assistant|chatgpt|aider|devin|augment|windsurf|bot)\b/i

/** Commit hygiene and release classification share the existing subject grammar. */
export function parseConventionalSubject(subject: string) {
  const match = SUBJECT.exec(subject)
  if (
    !match?.[1] ||
    !match[3] ||
    subject.length > 72 ||
    subject.endsWith('.') ||
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
