const SUBJECT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9./-]*\))?!?: ([a-z0-9].*)$/
const TOOL =
  /\b(ai|claude|anthropic|codex|openai|copilot|cursor|gemini|gpt|opencode|antigravity|assistant|chatgpt|aider|devin|augment|windsurf|bot)\b/i

/** Validate the message without rewriting authorship or silently fixing history. */
export function checkCommit(message: string): string[] {
  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const subject = lines[0] ?? ''
  const problems: string[] = []
  const match = SUBJECT.exec(subject)
  if (
    !match ||
    subject.length > 72 ||
    subject.endsWith('.') ||
    match[3] !== match[3]?.toLowerCase()
  ) {
    problems.push(
      'Use a lowercase Conventional Commit subject of at most 72 characters, e.g. feat(core): add state replay (no trailing period).',
    )
  }
  if (lines[1]?.trim()) problems.push('Separate the subject and body with a blank line.')
  if (!lines.slice(2).some((line) => line.trim() && !line.startsWith('#'))) {
    problems.push('Add a body explaining why the change is needed and what was verified.')
  }
  for (const line of lines) {
    if (
      (/^\s*co-authored-by\s*:/i.test(line) && TOOL.test(line)) ||
      /\b(generated|made)\s+(with|by)\b/i.test(line)
    ) {
      problems.push('Remove tool attribution from the commit message (ADR-0017).')
    }
  }
  if (message.includes('`') || message.includes('$(')) {
    problems.push('Do not use backticks or shell command substitutions in commit messages.')
  }
  return [...new Set(problems)]
}
