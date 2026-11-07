import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Render or check the repository's maintainer skills and agents (ADR-0246).
// The renderer is bundled into a disposable directory, never into dist/, so
// nothing about the repository's own tools is published with the package.
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  mode = process.argv.includes('--check') ? '--check' : '--write',
  destination = mkdtempSync(join(tmpdir(), 'wholeloop-maintainer-')),
  runner = join(destination, 'maintainer.mjs')
try {
  await build({
    entryPoints: [join(root, 'src/maintainer/cli.ts')],
    outfile: runner,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
    define: {
      __WL_VERSION__: JSON.stringify(
        JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
      ),
    },
    banner: {
      js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
    },
  })
  const result = spawnSync(process.execPath, [runner, root, mode], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(destination, { recursive: true, force: true })
}
