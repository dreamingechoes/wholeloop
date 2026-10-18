import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const { configSchema } = JSON.parse(
  execFileSync(process.execPath, ['dist/wl.mjs', 'config', 'schema', '--json'], {
    encoding: 'utf8',
  }),
)
const rows = []
function visit(rule, path = [], kind = 'team') {
  const ownKind = rule['x-kind'] ?? kind
  if (rule.properties) {
    for (const [key, child] of Object.entries(rule.properties))
      visit(child, [...path, key], ownKind)
  } else {
    const type = rule.enum
      ? rule.enum.join(' · ')
      : rule.type === 'object'
        ? 'map of strings'
        : rule.type === 'array'
          ? 'array of strings'
          : rule.type
    const defaultValue = Object.hasOwn(rule, 'default')
      ? `\`${JSON.stringify(rule.default)}\``
      : 'unset'
    rows.push(`| \`${path.join('.')}\` | ${ownKind} | ${type} | ${defaultValue} |`)
  }
}
visit(configSchema)
const table = ['| Key | Kind | Values | Default |', '| --- | --- | --- | --- |', ...rows].join('\n')
const file = 'docs/configuration/README.md'
const before = readFileSync(file, 'utf8')
const after = before.replace(
  /<!-- config:start -->[\s\S]*?<!-- config:end -->/,
  `<!-- config:start -->\n${table}\n<!-- config:end -->`,
)
if (process.argv.includes('--check')) {
  if (before !== after) throw new Error('Configuration reference is stale; run npm run docs:config')
} else writeFileSync(file, after)
