import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { conformanceIssues } from '../../../src/conformance/issues.js'
import { conformanceMatrix } from '../../../src/conformance/matrix.js'
import { reportedRegression } from '../../support/conformance.js'

const at = '2026-10-20T12:00:00.000Z'
describe('structural conformance issue drafts', () => {
  it('keeps stable keys, exact failures and original observation dates without private fields', () => {
    const input = reportedRegression()
    for (const run of input.runs)
      Object.assign(run.report, {
        journal: '/private-fixture/journal',
        rawOutput: 'private-fixture-detail',
        draft: 'private draft',
      })
    const plan = conformanceIssues(input, at),
      candidate = conformanceMatrix(input, at).regressionCandidates[0]
    expect(plan).toMatchObject({
      schema: 'wholeloop/conformance-issues@1',
      status: 'draft',
      effects: 'not-performed',
    })
    expect(plan.issues).toHaveLength(1)
    expect(plan.issues[0]).toMatchObject({
      key: candidate?.key,
      core: 'd'.repeat(64),
      title: 'conformance: claude 1.2.4 fails standalone framing',
    })
    expect(plan.issues[0]?.body).toContain('note.added:installed-skill-marker')
    expect(plan.issues[0]?.body).toContain('Pinned version: 1.2.3')
    expect(plan.issues[0]?.body).toContain('2026-10-20T11:00:00.000Z')
    expect(JSON.stringify(plan)).not.toContain('private-fixture')
    expect(JSON.stringify(plan)).not.toContain('private draft')
    const later = conformanceIssues(input, '2026-10-20T13:00:00.000Z')
    expect(later.issues).toEqual(plan.issues)
  })
  it.each(['simulation', 'stale', 'crash'])('does not draft issues from %s evidence', (kind) => {
    const input = reportedRegression(),
      baseline = input.runs[0],
      latest = input.runs[1]
    if (!baseline || !latest) throw new Error('Missing fixture reports')
    if (kind === 'simulation') {
      baseline.report.status = 'FIXTURE_PASS'
      baseline.report.evidence = 'simulation'
    }
    if (kind === 'stale') latest.observedAt = '2026-10-17T11:00:00.000Z'
    if (kind === 'crash') {
      latest.report.process.status = 'crashed'
      latest.report.process.code = 7
    }
    expect(conformanceIssues(input, at).issues).toEqual([])
  })
  it('refuses trailing control data in public prose without weakening matrix readers', () => {
    const input = reportedRegression(),
      latest = input.runs[1]
    if (!latest) throw new Error('Missing fixture report')
    latest.report.problems = ['workspace-changed\n']
    expect(() => conformanceIssues(input, at)).toThrow(/contents omitted/)
  })
})

describe('bounded issue delivery host with synthetic GitHub only', () => {
  it('previews, scans closed and paginated markers, delivers via stdin and deduplicates repeated runs', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-issue-host-')))
    const repo = join(root, 'source'),
      home = join(root, 'home'),
      bin = join(root, 'bin')
    for (const dir of [repo, home, bin, join(repo, 'scripts'), join(repo, 'dist')]) mkdirSync(dir)
    const core = join(repo, 'dist/wl.mjs'),
      script = join(repo, 'scripts/conformance-issues.mjs'),
      input = join(root, 'results.json'),
      calls = join(root, 'calls.jsonl'),
      ledger = join(root, 'ledger.json'),
      body = join(root, 'body.md')
    copyFileSync(resolve('dist/wl.mjs'), core)
    copyFileSync(resolve('scripts/conformance-issues.mjs'), script)
    copyFileSync(resolve('scripts/regular-file.mjs'), join(repo, 'scripts/regular-file.mjs'))
    const hash = createHash('sha256').update(readFileSync(core)).digest('hex')
    const observations = reportedRegression(hash, new Date(Date.now() - 1000).toISOString())
    writeFileSync(input, JSON.stringify(observations))
    const key = conformanceIssues(observations, new Date().toISOString()).issues[0]?.key
    if (!key) throw new Error('Missing fixture candidate')
    const fake = `#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2),mode=process.env.FIXTURE_ISSUE_MODE
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n')
if(args[0]==='api' && args[1]==='repos/fixture/wholeloop')console.log(JSON.stringify({repository:'fixture/wholeloop',defaultBranch:'main'}))
else if(args[0]==='api' && args[1]==='repos/fixture/wholeloop/issues'){
 const page=Number(args.find(a=>a.startsWith('page='))?.slice(5)??1)
 if(mode==='inventory-failed')process.exit(1)
 if(mode==='changed')fs.appendFileSync(${JSON.stringify(input)},'\\n')
 const existing=fs.existsSync(${JSON.stringify(ledger)})?JSON.parse(fs.readFileSync(${JSON.stringify(ledger)},'utf8')):undefined
 if(mode==='incomplete'||(mode==='page-two'&&page===1))console.log(JSON.stringify({count:100,matches:[]}))
 else if(existing||mode==='page-two')console.log(JSON.stringify({count:1,matches:[{number:existing?.number??41,keys:[${JSON.stringify(key)}]}]}))
 else console.log(JSON.stringify({count:0,matches:[]}))
}else if(args[0]==='issue'&&args[1]==='create'){
 if(mode==='partial'&&fs.existsSync(${JSON.stringify(ledger)}))process.exit(1)
 const body=fs.readFileSync(0,'utf8');fs.writeFileSync(${JSON.stringify(body)},body)
 fs.writeFileSync(${JSON.stringify(ledger)},JSON.stringify({key:${JSON.stringify(key)},number:42}))
 console.log('https://github.com/fixture/wholeloop/issues/42')
}else process.exit(9)
`
    writeFileSync(join(bin, 'gh'), fake, { mode: 0o755 })
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
      GITHUB_ACTIONS: 'true',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REPOSITORY: 'fixture/wholeloop',
      GITHUB_REF: 'refs/heads/main',
    }
    const run = (write = false, extra: NodeJS.ProcessEnv = {}) =>
      spawnSync(process.execPath, [script, input, ...(write ? ['--write'] : [])], {
        cwd: repo,
        env: { ...env, ...extra },
        encoding: 'utf8',
        timeout: 30000,
      })
    try {
      const preview = run()
      expect(preview.status, preview.stdout + preview.stderr).toBe(0)
      expect(JSON.parse(preview.stdout)).toMatchObject({
        status: 'planned',
        effects: 'not-performed',
        outcomes: [{ key, status: 'planned' }],
      })
      expect(existsSync(body)).toBe(false)
      const firstCalls = readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(firstCalls[1]).toEqual(
        expect.arrayContaining(['--method', 'GET', 'state=all', 'direction=asc', 'per_page=100']),
      )
      unlinkSync(calls)
      const paginated = run(true, { FIXTURE_ISSUE_MODE: 'page-two' })
      expect(paginated.status, paginated.stdout + paginated.stderr).toBe(0)
      expect(JSON.parse(paginated.stdout).outcomes).toEqual([
        { key, status: 'existing', number: 41 },
      ])
      expect(existsSync(body)).toBe(false)
      expect(readFileSync(calls, 'utf8')).toContain('page=2')
      unlinkSync(calls)
      const applied = run(true)
      expect(applied.status, applied.stdout + applied.stderr).toBe(0)
      expect(JSON.parse(applied.stdout)).toMatchObject({
        status: 'applied',
        effects: 'created-issues',
      })
      expect(readFileSync(body, 'utf8')).toContain(
        `<!-- wholeloop:conformance-regression:${key} -->\n`,
      )
      expect(readFileSync(body, 'utf8')).toContain('note.added:installed-skill-marker')
      const writtenCalls = readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(writtenCalls.at(-1)).toEqual(
        expect.arrayContaining([
          'issue',
          'create',
          '--repo',
          'fixture/wholeloop',
          '--body-file',
          '-',
        ]),
      )
      const again = run(true)
      expect(JSON.parse(again.stdout)).toMatchObject({
        effects: 'not-performed',
        outcomes: [{ key, status: 'existing', number: 42 }],
      })
      expect(
        readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .filter((row) => row[0] === 'issue'),
      ).toHaveLength(1)
      for (const extra of [
        { GITHUB_REF: 'refs/heads/topic' },
        { GITHUB_ACTIONS: 'false' },
        { GITHUB_EVENT_NAME: 'pull_request' },
        { FIXTURE_ISSUE_MODE: 'inventory-failed' },
        { FIXTURE_ISSUE_MODE: 'incomplete' },
      ]) {
        const failed = run(true, extra)
        expect(failed.status, failed.stdout + failed.stderr).toBe(1)
        expect(failed.stdout + failed.stderr).not.toContain('private-fixture-detail')
      }
      unlinkSync(ledger)
      unlinkSync(body)
      const multiple = structuredClone(observations)
      for (const [index, run] of observations.runs.entries()) {
        const copy = structuredClone(run)
        copy.report.cli = 'codex'
        copy.report.id = `cf-${(index === 0 ? 'c' : 'd').repeat(24)}`
        multiple.runs.push(copy)
      }
      writeFileSync(input, JSON.stringify(multiple))
      const partial = run(true, { FIXTURE_ISSUE_MODE: 'partial' })
      expect(partial.status).toBe(1)
      expect(JSON.parse(partial.stdout).outcomes).toEqual([
        { key, status: 'created', url: 'https://github.com/fixture/wholeloop/issues/42' },
      ])
      expect(partial.stderr).toContain('inspect actual outcomes before retrying')
      unlinkSync(ledger)
      unlinkSync(body)
      unlinkSync(calls)
      writeFileSync(input, JSON.stringify({ schema: 'wholeloop/conformance-results@1', runs: [] }))
      const empty = run(false, { GITHUB_REPOSITORY: '' })
      expect(empty.status, empty.stdout + empty.stderr).toBe(0)
      expect(JSON.parse(empty.stdout)).toMatchObject({ effects: 'not-performed', outcomes: [] })
      expect(existsSync(calls)).toBe(false)
      const wrongCore = structuredClone(observations)
      for (const entry of wrongCore.runs) entry.report.core = 'f'.repeat(64)
      writeFileSync(input, JSON.stringify(wrongCore))
      expect(run(true).status).toBe(1)
      expect(existsSync(calls)).toBe(false)
      writeFileSync(input, JSON.stringify(observations))
      const changed = run(true, { FIXTURE_ISSUE_MODE: 'changed' })
      expect(changed.status).toBe(1)
      expect(existsSync(body)).toBe(false)
      expect(readdirSync(home)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30000)

  it('runs compiled read-only drafts with explicit time and preserves input/HOME', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-issue-cli-'))),
      input = join(root, 'results.json'),
      home = join(root, 'home')
    mkdirSync(home)
    const text = JSON.stringify(reportedRegression())
    writeFileSync(input, text)
    const run = (args: string[]) =>
      spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'conformance', 'issues', ...args, '--json'],
        { cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8' },
      )
    try {
      const result = run([input, '--at', at])
      expect(result.status, result.stdout + result.stderr).toBe(4)
      expect(JSON.parse(result.stdout).issues).toHaveLength(1)
      expect(run([input]).status).toBe(4)
      const linked = join(root, 'linked.json')
      symlinkSync(input, linked)
      expect(run([linked, '--at', at]).status).toBe(4)
      expect(readFileSync(input, 'utf8')).toBe(text)
      expect(readdirSync(home)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
