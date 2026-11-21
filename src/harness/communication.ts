// Checks instructions to speak, leaving executable commands and private data contracts intact.
import { bannedTerms, INTERNAL_TERMS, PERSON_WORDS } from '../display/terms.js'
import type { Finding, HarnessTree } from './files.js'
import { STEP_PROTOCOLS } from './protocols.js'

export const SPEAKING_PROTOCOL = 'speaking-to-person'
const SPEAK =
  /(?:^|[,;]\s*|\b(?:then|and)\s+)(?:show|tell|explain|present|report|summarize|describe|say|hand back)\b/i
const ENTRYPOINT = /^harness\/(?:skills\/[^/]+\/SKILL|agents\/[^/]+)\.md$/
const PROTOCOL = /^harness\/protocols\/[^/]+\.md$/

export function personInstructionProblems(content: string): { line: number; message: string }[] {
  const findings: { line: number; message: string }[] = []
  let fenced = false
  let metadata = content.startsWith('---\n')
  content.split('\n').forEach((line, index) => {
    if (metadata) {
      if (index > 0 && line === '---') metadata = false
      return
    }
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced || /^\s*```/.test(line)) return
    // Commands, paths and field references must retain their real spelling for execution.
    const prose = line
      .replace(/^\s*(?:\d+\.\s*|-\s*(?:⛔\s*`[^`]+`\s*[—:]\s*)?)/, '')
      .replace(/`([^`]+)`/g, (whole, value: string) =>
        /^(?:wl |node |--|wholeloop\/)|[/.]|[A-Z_]{2,}/.test(value) ? '' : whole,
      )
    for (const sentence of prose.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const instruction = SPEAK.exec(sentence)
      if (!instruction) continue
      const terms = bannedTerms(sentence.slice(instruction.index))
      if (terms.length)
        findings.push({
          line: index + 1,
          message: `Internal terms in speaking instruction: ${terms.map((term) => `${term} → ${PERSON_WORDS[term]}`).join(', ')}`,
        })
    }
  })
  return findings
}

/** Legacy files stay readable, but canonical small-result instructions must avoid scratch writes. */
export function streamInputProblems(content: string): string[] {
  const problems: string[] = []
  for (const match of content.matchAll(/`([^`]+)`/g)) {
    const command = (match[1] ?? '').replace(/\s+/g, ' ').trim()
    if (
      /^wl (?:frame (?:draft|finalize)|gate submit|research (?:submit|examine|complete)|build plan|learn challenge|measure (?:observe|format)|ramp (?:observe|confirm)|share reconcile|sync)\b/.test(
        command,
      ) &&
      /(?:^| )--file(?: |$)/.test(command)
    )
      problems.push('Small step payload instructions must use --stdin or existing answer options')
  }
  return problems
}

export function checkCommunication(tree: HarnessTree): Finding[] {
  const findings: Finding[] = []
  const add = (file: string, message: string, line?: number) =>
    findings.push({ file, rule: 'enforcement', message, ...(line ? { line } : {}) })
  const speaking = tree.read(`harness/protocols/${SPEAKING_PROTOCOL}.md`)
  for (const [file, content] of tree.files) {
    if (!ENTRYPOINT.test(file) && !PROTOCOL.test(file)) continue
    for (const problem of streamInputProblems(content)) add(file, problem)
    if (file !== `harness/protocols/${SPEAKING_PROTOCOL}.md`)
      for (const finding of personInstructionProblems(content))
        add(file, finding.message, finding.line)
    if (/^harness\/skills\//.test(file) && !content.includes(`Read ${SPEAKING_PROTOCOL}.`))
      add(file, `Every skill must load ${SPEAKING_PROTOCOL}`)
    const name = /^harness\/skills\/([^/]+)\/SKILL.md$/.exec(file)?.[1]
    const expected = name ? STEP_PROTOCOLS[name] : undefined
    if (expected) {
      const reads = content.split('\n').find((line) => line.startsWith('Read ')) ?? ''
      const actual = (reads.match(/\b[a-z]+(?:-[a-z]+)*\b/g) ?? []).filter(
        (word) => !['the', 'shared', 'and', 'protocol', 'protocols'].includes(word),
      )
      if (JSON.stringify([...actual].sort()) !== JSON.stringify(expected))
        add(file, 'Startup protocols must match the step-specific read list')
      for (const protocol of expected)
        if (!tree.read(`harness/protocols/${protocol}.md`))
          add(file, `Missing required protocol ${protocol}`)
    }
    if (/\b(?:Read|Load|Use)\b[^\n]*(?:core-invariants|policies\/)/.test(content))
      add(file, 'Do not load core-owned declarations into a runtime entrypoint')
    if (
      ENTRYPOINT.test(file) &&
      /\b(?:not collected yet|Linux not run)\b|\b(?:needs?|requires?|pending|unverified|still|awaits?)\b[^.\n]*\bconformance\b|\bconformance\b[^.\n]*\b(?:pending|required|not run)\b/i.test(
        content,
      )
    )
      add(file, 'Report actual missing evidence instead of maintainer status caveats')
  }
  for (const term of INTERNAL_TERMS)
    if (!speaking?.includes(`| ${term} | ${PERSON_WORDS[term]} |`))
      add(`harness/protocols/${SPEAKING_PROTOCOL}.md`, `Missing person-facing words for ${term}`)
  return findings
}
