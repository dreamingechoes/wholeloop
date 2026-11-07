import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import pkg from '../../../package.json' with { type: 'json' }

// The contribution workflow (P7-09) lives in files the maintainer applies to
// the hosted repository; these tests keep them consistent with CI and with
// each other, since GitHub only reports a mismatch after they are applied.
const read = (path: string) => readFileSync(path, 'utf8')
const ruleset = (name: string) => JSON.parse(read(`.github/rulesets/${name}.json`))
type Rule = { type: string; parameters?: Record<string, unknown> }

describe('pull-request contribution workflow', () => {
  it('requires exactly the checks that CI reports, by their expanded names', () => {
    const ci = parse(read('.github/workflows/ci.yml'))
    expect(Object.keys(ci.on)).toEqual(
      expect.arrayContaining(['pull_request', 'workflow_dispatch']),
    )
    const reported = Object.values(ci.jobs).flatMap((job) => {
      const { name, strategy } = job as { name: string; strategy?: { matrix?: { os?: string[] } } }
      const systems = strategy?.matrix?.os ?? ['']
      return systems.map((os) => name.replace(['$', '{{ matrix.os }}'].join(''), os))
    })
    const rules: Rule[] = ruleset('main').rules
    const checks = rules.find((rule) => rule.type === 'required_status_checks')?.parameters as {
      strict_required_status_checks_policy: boolean
      required_status_checks: { context: string }[]
    }
    expect(checks.strict_required_status_checks_policy).toBe(true)
    expect(checks.required_status_checks.map((check) => check.context).sort()).toEqual(
      reported.sort(),
    )
  })

  it('accepts changes to main only through squash-merged pull requests, with no bypass', () => {
    const main = ruleset('main')
    expect(main).toMatchObject({ target: 'branch', enforcement: 'active', bypass_actors: [] })
    expect(main.conditions.ref_name.include).toEqual(['~DEFAULT_BRANCH'])
    const types = (main.rules as Rule[]).map((rule) => rule.type)
    expect(types).toEqual(
      expect.arrayContaining([
        'deletion',
        'non_fast_forward',
        'required_linear_history',
        'pull_request',
        'required_status_checks',
      ]),
    )
    const pr = (main.rules as Rule[]).find((rule) => rule.type === 'pull_request')?.parameters
    expect(pr?.allowed_merge_methods).toEqual(['squash'])
    expect(pr?.required_review_thread_resolution).toBe(true)
    const tags = ruleset('release-tags')
    expect(tags).toMatchObject({ target: 'tag', enforcement: 'active', bypass_actors: [] })
    expect(tags.conditions.ref_name.include).toEqual(['refs/tags/v*'])
    // Creation stays allowed: the Release workflow creates each tag once.
    expect((tags.rules as Rule[]).map((rule) => rule.type).sort()).toEqual([
      'deletion',
      'non_fast_forward',
      'update',
    ])
  })

  it('assigns every path to the repository owner and asks for a conventional title', () => {
    const owner = new URL(pkg.repository.url.replace(/^git\+/, '')).pathname.split('/')[1]
    const rules = read('.github/CODEOWNERS')
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
    expect(rules[0]).toBe(`* @${owner}`)
    const template = read('.github/pull_request_template.md')
    for (const item of [
      'Conventional Commit subject',
      'squash-merged',
      'CHECK PASS',
      'attribution',
    ])
      expect(template).toContain(item)
  })

  it('describes the same workflow to contributors and to coding agents', () => {
    const contributing = read('CONTRIBUTING.md')
    const agents = read('AGENTS.md')
    for (const text of [contributing, agents]) expect(text).toContain('roadmap/journal.md')
    expect(contributing).toContain('.github/rulesets/main.json')
    // Until the maintainer announces the switch, both still say to commit to main.
    const bootstrap = /commit(?:ted)? (?:straight|directly) to `?main`?/i
    expect(bootstrap.test(agents)).toBe(bootstrap.test(contributing))
  })
})
