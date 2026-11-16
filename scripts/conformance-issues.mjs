import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRegularFile } from './regular-file.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const core = join(repository, 'dist/wl.mjs')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const marker = (key) => `<!-- wholeloop:conformance-regression:${key} -->`
const outcomes = []
let stage = 'input validation'
function command(executable, args, options = {}) {
  const { allowDraft = false, ...spawnOptions } = options
  const result = spawnSync(executable, args, {
    cwd: repository,
    encoding: 'utf8',
    timeout: 30000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    ...spawnOptions,
  })
  if (result.error || ![0, ...(allowDraft ? [4] : [])].includes(result.status))
    throw new Error('Issue host subprocess failed; diagnostics omitted')
  return result.stdout.trim()
}
function bounded(path, limit = 1024 * 1024) {
  try {
    return readRegularFile(path, limit)
  } catch {
    assert.fail('Expected a bounded regular file')
  }
}

try {
  const [input, flag, ...extra] = process.argv.slice(2)
  assert(input && !extra.length && (flag === undefined || flag === '--write'))
  const write = flag === '--write',
    path = resolve(input)
  if (write) {
    assert.equal(process.env.GITHUB_ACTIONS, 'true')
    assert.equal(process.env.GITHUB_SERVER_URL, 'https://github.com')
    assert(['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME))
  }
  const before = digest(bounded(path)),
    coreHash = digest(bounded(core, 128 * 1024 * 1024))
  const coreEnv = {
    ...process.env,
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    NODE_OPTIONS: undefined,
    NODE_PATH: undefined,
  }
  const plan = () => {
    assert.equal(digest(bounded(path)), before, 'Observation artifact changed')
    const result = JSON.parse(
      command(
        process.execPath,
        [core, 'conformance', 'issues', path, '--at', new Date().toISOString(), '--json'],
        { env: coreEnv, allowDraft: true },
      ),
    )
    assert.equal(digest(bounded(path)), before)
    assert.equal(result.schema, 'wholeloop/conformance-issues@1')
    assert.equal(result.effects, 'not-performed')
    assert(Array.isArray(result.issues) && result.issues.length <= 7)
    for (const issue of result.issues) {
      assert(/^[a-f0-9]{64}$/.test(issue.key))
      assert.equal(issue.core, coreHash, 'Collect observations using this exact built core')
      assert(typeof issue.title === 'string' && issue.title.length <= 200)
      assert(
        typeof issue.body === 'string' &&
          Buffer.byteLength(issue.body) <= 32768 &&
          issue.body.includes(marker(issue.key)),
      )
    }
    return result
  }
  stage = 'current structural issue projection'
  const drafted = plan()
  if (drafted.issues.length) {
    stage = 'repository observation'
    const slug = process.env.GITHUB_REPOSITORY
    assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug ?? ''))
    const ghEnv = {
      ...process.env,
      GH_HOST: 'github.com',
      NODE_OPTIONS: undefined,
      NODE_PATH: undefined,
    }
    const gh = (args, input) => command('gh', args, { env: ghEnv, input })
    const observed = JSON.parse(
      gh(['api', `repos/${slug}`, '--jq', '{repository:.full_name,defaultBranch:.default_branch}']),
    )
    assert.equal(observed.repository, slug)
    assert(
      typeof observed.defaultBranch === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(observed.defaultBranch),
    )
    if (write) assert.equal(process.env.GITHUB_REF, `refs/heads/${observed.defaultBranch}`)
    const keys = drafted.issues.map((issue) => issue.key)
    // Only validated digest literals enter this jq program; no imported prose becomes executable syntax.
    const projection = `{count:length,matches:[.[]|select(.pull_request == null)|(.body // "") as $body|{number,keys:[${JSON.stringify(keys)}[] as $key|select($body|contains("<!-- wholeloop:conformance-regression:"+$key+" -->"))|$key]}|select(.keys|length>0)]}`
    const known = new Map()
    let complete = false
    stage = 'complete open and closed issue inventory'
    for (let page = 1; page <= 100; page++) {
      const result = JSON.parse(
        gh([
          'api',
          `repos/${slug}/issues`,
          '--method',
          'GET',
          '-f',
          'state=all',
          '-f',
          'sort=created',
          '-f',
          'direction=asc',
          '-f',
          'per_page=100',
          '-f',
          `page=${page}`,
          '--jq',
          projection,
        ]),
      )
      assert(
        Number.isInteger(result.count) &&
          result.count >= 0 &&
          result.count <= 100 &&
          Array.isArray(result.matches),
      )
      assert(result.matches.length <= result.count)
      for (const match of result.matches) {
        assert(Number.isSafeInteger(match.number) && match.number > 0 && Array.isArray(match.keys))
        for (const key of match.keys) {
          assert(keys.includes(key))
          known.set(key, match.number)
        }
      }
      if (result.count < 100) {
        complete = true
        break
      }
    }
    assert(complete, 'Issue inventory exceeds the bounded complete scan; no writes performed')
    for (const issue of drafted.issues) {
      if (known.has(issue.key)) {
        outcomes.push({ key: issue.key, status: 'existing', number: known.get(issue.key) })
        continue
      }
      if (!write) {
        outcomes.push({ key: issue.key, status: 'planned' })
        continue
      }
      // Re-evaluate the unchanged observations at the actual delivery time, without refreshing their dates.
      stage = 'freshness recheck before delivery'
      const current = plan().issues.find((candidate) => candidate.key === issue.key)
      if (!current) {
        outcomes.push({ key: issue.key, status: 'no-longer-current' })
        continue
      }
      stage = 'explicit issue creation'
      const url = new URL(
        gh(
          ['issue', 'create', '--repo', slug, '--title', current.title, '--body-file', '-'],
          current.body,
        ),
      )
      assert.equal(url.origin, 'https://github.com')
      const prefix = `/${slug}/issues/`
      assert(
        url.pathname.startsWith(prefix) &&
          /^\d+$/.test(url.pathname.slice(prefix.length)) &&
          !url.username &&
          !url.password &&
          !url.hash &&
          !url.search,
      )
      outcomes.push({ key: issue.key, status: 'created', url: url.href })
      known.set(issue.key, Number(url.pathname.slice(prefix.length)))
    }
  }
  console.log(
    JSON.stringify({
      schema: 'wholeloop/conformance-issue-run@1',
      status: write ? 'applied' : 'planned',
      outcomes,
      effects: outcomes.some((item) => item.status === 'created')
        ? 'created-issues'
        : 'not-performed',
      limitations: [
        'Serialize writers: GitHub issue creation has no atomic marker-based uniqueness across independent callers.',
        'Only structural drafts are delivered; imported report provenance and actual native acceptance require separate evidence.',
      ],
    }),
  )
} catch {
  console.log(
    JSON.stringify({ schema: 'wholeloop/conformance-issue-run@1', status: 'failed', outcomes }),
  )
  console.error(
    `conformance issues: failed at ${stage}; inspect actual outcomes before retrying; diagnostics omitted`,
  )
  process.exitCode = 1
}
