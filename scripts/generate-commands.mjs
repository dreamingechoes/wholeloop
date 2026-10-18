import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const { commands } = JSON.parse(
  execFileSync(process.execPath, ['dist/wl.mjs', '--help', '--json'], { encoding: 'utf8' }),
)
const table = [
  '| Command | Output schema | Purpose |',
  '| --- | --- | --- |',
  ...commands.map(
    (command) =>
      `| \`wl ${command.path}${command.arguments ? ` ${command.arguments}` : ''}\` | \`${command.schema}\` | ${command.summary} |`,
  ),
].join('\n')
const file = 'docs/architecture/core-cli.md'
const before = readFileSync(file, 'utf8')
const after = before.replace(
  /<!-- commands:start -->[\s\S]*?<!-- commands:end -->/,
  `<!-- commands:start -->\n${table}\n<!-- commands:end -->`,
)
if (process.argv.includes('--check')) {
  if (before !== after) throw new Error('Command reference is stale; run npm run docs:commands')
} else writeFileSync(file, after)
