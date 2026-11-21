// Keeps the copied public core within its existing bound while retaining the paired controller.
import { createHash } from 'node:crypto'
import { chmod, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'
import { privateEvaluator } from './private-evaluator.mjs'

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const outfile = 'dist/wl.mjs'
// The owned controller child composes the fixed domain adapters. It is a
// separate self-contained bundle so the single-file core, which hooks and
// installs copy under a 4 MiB bound, stays small (ADR-0205).
const controller = 'dist/wl-runner.mjs'
const shared = {
  bundle: true,
  minifyWhitespace: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  logLevel: 'warning',
}
const defines = {
  __WL_VERSION__: JSON.stringify(version),
  __WL_PRIVATE_EVALUATOR__: JSON.stringify(await privateEvaluator(import.meta.url)),
  __WL_HARNESS__: JSON.stringify(harnessAssets(fileURLToPath(new URL('../', import.meta.url)))),
}
const banner =
  // The banner is opaque to esbuild's identifier renaming. Keep its import
  // separate from source imports such as the manifest package resolver.
  "#!/usr/bin/env node\nimport * as __wlModule from 'node:module'\nconst require = __wlModule.createRequire(import.meta.url)"

await build({
  ...shared,
  entryPoints: ['src/runner/controller-bin.ts'],
  outfile: controller,
  banner: { js: banner },
  // The controller never launches another controller bundle.
  define: { ...defines, __WL_CONTROLLER_SHA256__: '""' },
})
const digest = createHash('sha256')
  .update(await readFile(controller))
  .digest('hex')
await build({
  ...shared,
  entryPoints: ['src/cli/bin.ts'],
  outfile,
  banner: { js: banner },
  define: { ...defines, __WL_CONTROLLER_SHA256__: JSON.stringify(digest) },
})
if ((await readFile(outfile)).byteLength > 4 * 1024 * 1024)
  throw new Error('The public core exceeds its existing 4 MiB copy bound')
await chmod(outfile, 0o755)
console.log(`built ${outfile} and ${controller} (wholeloop ${version})`)
