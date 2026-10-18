import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let range = process.argv[2]
if (!range && process.env.GITHUB_EVENT_NAME === 'pull_request') {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  range = `${event.pull_request.base.sha}..${event.pull_request.head.sha}`
}
if (!range) {
  console.log('commits: no range (pass base..head; PR CI supplies it automatically)')
} else {
  // Reject revisions that Git could interpret as flags. No shell handles message text.
  if (range.startsWith('-')) throw new Error('Expected a revision range, not an option')
  const ids = execFileSync('git', ['rev-list', '--no-merges', range, '--'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
  const temporary = mkdtempSync(join(tmpdir(), 'wholeloop-commits-'))
  try {
    for (const id of ids) {
      const file = join(temporary, 'message')
      writeFileSync(file, execFileSync('git', ['show', '-s', '--format=%B', id]))
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../dist/wl.mjs', import.meta.url)), 'guard', 'commit-msg', file],
        {
          stdio: 'inherit',
        },
      )
      if (result.status !== 0) {
        console.error(`commits: rejected ${id}`)
        process.exitCode = 4
      }
    }
    console.log(`commits: checked ${ids.length} commit(s)`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
