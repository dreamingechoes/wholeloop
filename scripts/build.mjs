import { chmod, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { harnessAssets } from './harness-assets.mjs'

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const outfile = 'dist/wl.mjs'

await build({
  entryPoints: ['src/cli/bin.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    // The banner is opaque to esbuild's identifier renaming. Keep its import
    // separate from source imports such as the manifest package resolver.
    js: "#!/usr/bin/env node\nimport * as __wlModule from 'node:module'\nconst require = __wlModule.createRequire(import.meta.url)",
  },
  define: {
    __WL_VERSION__: JSON.stringify(version),
    __WL_HARNESS__: JSON.stringify(harnessAssets(fileURLToPath(new URL('../', import.meta.url)))),
  },
  legalComments: 'none',
  logLevel: 'warning',
})
await chmod(outfile, 0o755)
console.log(`built ${outfile} (wholeloop ${version})`)
