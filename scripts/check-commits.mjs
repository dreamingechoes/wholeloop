import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let range = process.argv[2]
let title
if (!range && process.env.GITHUB_EVENT_NAME === 'pull_request') {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  range = `${event.pull_request.base.sha}..${event.pull_request.head.sha}`
  // Pull requests are squash-merged (P7-09): the title becomes the subject of
  // the commit on main and the commit messages checked below become its body.
  title = event.pull_request.title
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
  const file = join(temporary, 'message')
  const guard = (message) => {
    writeFileSync(file, message)
    return spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../dist/wl.mjs', import.meta.url)), 'guard', 'commit-msg', file],
      { stdio: 'inherit' },
    ).status
  }
  try {
    for (const id of ids) {
      if (guard(execFileSync('git', ['show', '-s', '--format=%B', id])) !== 0) {
        console.error(`commits: rejected ${id}`)
        process.exitCode = 4
      }
    }
    console.log(`commits: checked ${ids.length} commit(s)`)
    // The title alone has no body of its own; a fixed one lets the same
    // validator judge the subject, attribution and shell substitutions.
    if (title !== undefined) {
      if (guard(`${title}\n\nSquash-merge subject of this pull request.\n`) !== 0) {
        console.error('commits: rejected the pull request title')
        process.exitCode = 4
      } else console.log('commits: checked the pull request title')
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
