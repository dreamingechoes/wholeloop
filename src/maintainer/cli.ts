import { maintainerDrift, writeMaintainer } from './render.js'

/** Entry point bundled by scripts/maintainer.mjs; never part of the published CLI. */
const root = process.argv[2],
  mode = process.argv[3]
if (!root || (mode !== '--check' && mode !== '--write')) {
  console.error('Usage: maintainer <root> --check|--write')
  process.exit(2)
}
if (mode === '--write') {
  const { written, removed } = writeMaintainer(root)
  console.log(`maintainer: ${written} written, ${removed} removed`)
} else {
  const problems = maintainerDrift(root)
  for (const problem of problems) console.error(`maintainer: ${problem}`)
  console.log(
    problems.length
      ? `maintainer: ${problems.length} problem(s); run npm run maintainer:render`
      : 'maintainer: rendered files match their sources',
  )
  process.exitCode = problems.length ? 1 : 0
}
