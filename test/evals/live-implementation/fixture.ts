import assert from 'node:assert/strict'
import { lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sourceHash } from '../../../src/delivery/input.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'
import { SEED } from '../../support/public-implementation.js'

export const TRIAL_REPOSITORY = 'dreamingechoes/wholeloop-trials'
export const TASK =
  'Change status.txt from pending to public fixture. GET / must return the JSON object {"status":"public fixture"}. Keep app.cjs, suite.cjs, package.json, REVIEW.md and the CI workflow unchanged. No dependencies, credentials, merge or other feature.'

// Only status.txt needs implementation. The pre-existing suite and HTTP entry
// point stay pinned, so a builder cannot satisfy this trial by weakening QA.
export const TRIAL_FILES: Record<string, string> = {
  ...SEED,
  'status.txt': 'pending',
  'suite.cjs':
    "const assert=require('node:assert/strict');const fs=require('node:fs');assert.equal(fs.readFileSync('status.txt','utf8'),'public fixture');console.log('status suite PASS');\n",
  '.github/workflows/check.yml':
    'name: check\non: [push, pull_request]\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020\n        with:\n          node-version: 22\n      - run: npm run check\n',
}

/** Reject additional guidance and symlinks before reading any checkout bytes. */
export function verifyTrialSeed(root: string) {
  const tree = git(root, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').sort()
  assert.deepEqual(tree, Object.keys(TRIAL_FILES).sort(), 'Unexpected campaign tree')
  for (const [ref, body] of Object.entries(TRIAL_FILES)) {
    const path = join(root, ref)
    assert.ok(lstatSync(path).isFile(), `Non-regular campaign input: ${ref}`)
    // Compare hashes so a refused input never gets copied into diagnostics.
    assert.equal(
      sourceHash(readFileSync(path, 'utf8')),
      sourceHash(body),
      `Changed campaign input: ${ref}`,
    )
  }
  assert.equal(git(root, ['status', '--porcelain']), '', 'Dirty campaign checkout')
}

export function trialRecipe(store: string, root: string) {
  const recipe = environmentRecipe(
    root,
    TRIAL_FILES['app.cjs'] ?? '',
    process.arch === 'x64' ? 'amd64' : 'arm64',
  )
  recipe.data = []
  for (const service of recipe.services)
    service.mounts = service.mounts.filter((mount) => mount.kind !== 'data')
  recipe.files.push(
    {
      id: 'package',
      repository: 'app',
      ref: 'package.json',
      sha256: sourceHash(TRIAL_FILES['package.json'] ?? ''),
      kind: 'package',
    },
    {
      id: 'suite',
      repository: 'app',
      ref: 'suite.cjs',
      sha256: sourceHash(TRIAL_FILES['suite.cjs'] ?? ''),
      kind: 'script',
    },
  )
  recipe.commands.push({
    id: 'suite',
    service: 'web',
    phase: 'test',
    command: {
      argv: ['npm', 'run', 'check'],
      cwd: '/workspace/app',
      origin: { kind: 'package-script', file: 'package', script: 'check' },
    },
    timeoutMs: 5000,
  })
  return new DeliveryEnvironments(store).recipes.prepare(recipe).digest
}
