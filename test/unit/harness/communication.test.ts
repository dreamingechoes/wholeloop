import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { INTERNAL_TERMS, PERSON_WORDS } from '../../../src/display/terms.js'
import {
  checkCommunication,
  personInstructionProblems,
} from '../../../src/harness/communication.js'
import { tree } from './fixtures.js'

describe('instructions for speaking to a person', () => {
  it.each(INTERNAL_TERMS)(
    'rejects %s in visible explanations and lists its replacement',
    (term) => {
      expect(personInstructionProblems(`Tell the person about the ${term}.`)).toEqual([
        {
          line: 1,
          message: `Internal terms in speaking instruction: ${term} → ${PERSON_WORDS[term]}`,
        },
      ])
      expect(personInstructionProblems(`Show the \`${term}\`.`)).toHaveLength(1)
    },
  )

  it('retains exact executable commands, private fields and data examples', () => {
    expect(
      personInstructionProblems(
        'Show `wl build preflight <id> --json`.\nRead the pinned basis.\nShow `receipt.text`.\n```json\n{"quorum": 3}\n```',
      ),
    ).toEqual([])
  })

  it('catches a visible instruction after a private sentence or inline code', () => {
    expect(personInstructionProblems('Read the plan. Tell the person the quorum.')).toHaveLength(1)
    expect(personInstructionProblems('Show `display.text` and explain the receipt.')).toHaveLength(
      1,
    )
  })

  it('requires the shared protocol and every mapping, rejecting loaded core policies and stale caveats', () => {
    const findings = checkCommunication(
      tree({
        'harness/skills/example/SKILL.md':
          'Read policies/core-invariants.md.\nLinux not run.\nShow the receipt.',
      }),
    )
    expect(findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('receipt → result'),
        expect.stringContaining('Every skill must load'),
        expect.stringContaining('Do not load core-owned'),
        expect.stringContaining('maintainer status caveats'),
        ...INTERNAL_TERMS.map((term) => `Missing person-facing words for ${term}`),
      ]),
    )
  })

  it('checks the complete canonical harness, including loaded protocol instructions', () => {
    const files = bundledCanonical()
    expect(checkCommunication({ files, read: (path) => files.get(path) })).toEqual([])
  })

  it('rejects an unrelated startup protocol and refuses to render a regressed harness', () => {
    const files = new Map(bundledCanonical())
    const path = 'harness/skills/status/SKILL.md'
    files.set(
      path,
      (files.get(path) ?? '').replace(
        'Read speaking-to-person.',
        'Read speaking-to-person, guards.',
      ),
    )
    expect(checkCommunication({ files, read: (path) => files.get(path) })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Startup protocols must match the step-specific read list',
        }),
      ]),
    )
    expect(() => generateAdapter('codex', files, '#!/usr/bin/env node\n', '0.0.0')).toThrow(
      'Canonical harness validation failed',
    )
  })

  it.each(ADAPTERS)(
    '$id retains short command notation and the same speaking policy',
    (adapter) => {
      const canonical = bundledCanonical()
      const generated = generateAdapter(adapter.id, canonical, '#!/usr/bin/env node\n', '0.0.0')
      const policy = generated.files.get('resources/protocols/speaking-to-person.md')?.content
      expect(policy).toBe(canonical.get('harness/protocols/speaking-to-person.md'))
      expect(policy).toContain('never authorizes a PATH lookup')
      for (const [path] of canonical) {
        const name = /^harness\/skills\/([^/]+)\/SKILL.md$/.exec(path)?.[1]
        if (!name) continue
        const skill = generated.files.get(adapter.paths('skill', name))?.content ?? ''
        expect(skill, name).toContain('Read speaking-to-person.')
        expect(skill, name).not.toContain('core-invariants')
        expect(personInstructionProblems(skill), name).toEqual([])
        expect(skill, name).toMatch(/`wl /)
      }
      const next = generated.files.get(adapter.paths('skill', 'next'))?.content ?? ''
      expect(next).toContain('never')
      expect(next).toContain('PATH')
      if (adapter.id === 'claude')
        expect(next).toContain('For execution only, replace the leading wl')
      else expect(next).toContain('scripts/wl.mjs')
    },
  )
})
