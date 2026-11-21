// Exercises real rendered roles and rejects unusable tool instructions without native clients.

import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { renderedRoleTools, roleToolProblems } from '../../../src/adapters/role-tools.js'
import { canonicalRoles, roleInvocationName, roleReferences } from '../../../src/adapters/roles.js'

const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'
const canonical = () => bundledCanonical()

describe.each(ADAPTERS)('$id role handoffs', (adapter) => {
  it('renders every available role with instructions compatible with its actual tools', () => {
    const generated = generateAdapter(adapter.id, canonical(), core, '0.0.0')
    for (const role of canonicalRoles(canonical())) {
      const agent = generated.files.get(adapter.paths('agent', role))
      if (adapter.omitAgents?.includes(role)) {
        expect(agent).toBeUndefined()
        continue
      }
      expect(agent, role).toBeDefined()
      const text = agent?.content ?? ''
      expect(roleToolProblems(text), role).toEqual([])
      const { body, allowed } = renderedRoleTools(text)
      if (allowed.shell === false) {
        expect(body, role).not.toMatch(/\bwl\s+[a-z]|\bbin\/wl\.mjs\b/)
        expect(body, role).toContain('final message')
        expect(body, role).toContain('conductor')
      }
    }
  })

  it('refuses a command requirement added to a role without a command tool', () => {
    const source = canonical()
    const role = 'harness/agents/reviewer.md'
    source.set(role, `${source.get(role)}\nRun \u0060wl status --json\u0060.\n`)
    expect(() => generateAdapter(adapter.id, source, core, '0.0.0')).toThrow(
      'Instructions require the disabled shell interface',
    )
  })

  it('does not add command instructions to a writing role without declared shell access', () => {
    const source = canonical()
    const path = 'harness/agents/builder.md'
    source.set(path, (source.get(path) ?? '').replace('read write shell', 'read write'))
    const generated = generateAdapter(adapter.id, source, core, '0.0.0')
    const text = generated.files.get(adapter.paths('agent', 'builder'))?.content ?? ''
    expect(renderedRoleTools(text).body).not.toMatch(/\bwl\s+[a-z]|\bbin\/wl\.mjs\b/)
  })

  it('renders named roles and explicit fresh assignment boundaries in delegating skills', () => {
    const generated = generateAdapter(adapter.id, canonical(), core, '0.0.0')
    for (const [skill, roles] of [
      ['research', ['researcher', 'challenger']],
      ['frame-problem', ['challenger']],
      ['write-spec', ['challenger']],
      ['cut-scopes', ['challenger']],
      ['slice-work', ['challenger']],
      ['build-slice', ['builder']],
      ['verify-works', ['verifier']],
      ['review-code', ['reviewer']],
      ['measure-impact', ['analyst']],
      ['decide-next', ['challenger']],
    ] as const) {
      const text = generated.files.get(adapter.paths('skill', skill))?.content ?? ''
      expect(text, skill).toContain('worker-handoffs')
      expect(text, skill).toContain('Never fork conversation history or copy the conductor')
      expect(text, skill).toContain('required protocol text and result schema')
      for (const role of roles)
        expect(text, skill).toContain(
          `\u0060${roleInvocationName(adapter.id, role, adapter.name('agent', role))}\u0060`,
        )
    }
    const launch = generated.files.get(adapter.paths('skill', 'prepare-launch'))?.content ?? ''
    expect(launch).toContain('worker-handoffs')
    if (adapter.omitAgents?.includes('launcher'))
      expect(launch).toContain('--engine headless --adapter codex')
    else
      expect(launch).toContain(
        `\u0060${roleInvocationName(adapter.id, 'launcher', adapter.name('agent', 'launcher'))}\u0060`,
      )
  })
})

it('Codex skills invoke a normal command directly and consume its checked context', () => {
  const generated = generateAdapter('codex', canonical(), core, '0.0.0')
  for (const [path, file] of generated.files) {
    if (!path.endsWith('/SKILL.md')) continue
    expect(file.content, path).toContain('--with-context before the command and --json')
    expect(file.content, path).toContain('context.root')
    expect(file.content, path).not.toContain('adapter root')
  }
})

it('checks explicit disabled write and web tool instructions as well as core commands', () => {
  const output = (tools: string, instruction: string) =>
    `---\nname: fixture\ndescription: Fixture\ntools: [${tools}]\n---\n${instruction}\n`
  expect(roleToolProblems(output('read_file', 'Use write_file to change a result.'))).toEqual([
    'Instructions require the disabled write interface',
  ])
  expect(roleToolProblems(output('read_file', 'Call web_fetch for the source.'))).toEqual([
    'Instructions require the disabled web interface',
  ])
  expect(
    roleToolProblems(output('read_file', 'Never edit files; return your final message.')),
  ).toEqual([])
  expect(
    roleToolProblems(output('read_file, run_shell_command', 'Run \u0060wl status --json\u0060.')),
  ).toEqual([])
})

it('derives added role names from canonical files and never rewrites a longer unrelated name', () => {
  const roles = canonicalRoles(
    new Map([
      ['harness/agents/auditor.md', 'Fixture'],
      ['harness/agents/auditor-detail.md', 'Fixture'],
      ['harness/skills/auditor/SKILL.md', 'Not a role'],
    ]),
  )
  expect(roles).toEqual(['auditor', 'auditor-detail'])
  expect(
    roleReferences(
      'wl-auditor wl-auditor-detail wl-auditor-extra',
      roles,
      (role) => `native-${role}`,
    ),
  ).toBe('native-auditor native-auditor-detail wl-auditor-extra')
})

it.each([
  ['Glob', 'Use Read to inspect the artifact.', 'read'],
  ['WebFetch', 'Call web_fetch for the source.', 'web'],
  ['run_shell_command', 'Call Bash for the command.', 'shell'],
  ['read_file', 'Call exec_command for the command.', 'shell'],
  ['run_shell_command', 'Read the assigned artifact.', 'read'],
])(
  'rejects unavailable exact tools despite other allowed interfaces',
  (tools, instruction, kind) => {
    const text = `---\nname: fixture\ndescription: Fixture\ntools: [${tools}]\n---\n${instruction}\n`
    expect(roleToolProblems(text)).toEqual([`Instructions require the disabled ${kind} interface`])
  },
)
