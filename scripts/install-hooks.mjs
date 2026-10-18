import { execFileSync } from 'node:child_process'

let current = ''
try {
  current = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim()
} catch (error) {
  if (error.status !== 1) throw error
}
if (current && current !== '.githooks') {
  console.error(
    `hooks: keep existing core.hooksPath=${current}; chain .githooks/commit-msg manually`,
  )
  process.exitCode = 3
} else {
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'])
  console.log(current ? 'hooks: already correct' : 'hooks: installed .githooks')
}
