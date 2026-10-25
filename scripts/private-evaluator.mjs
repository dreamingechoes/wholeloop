import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** Embed the reviewed source once; the installed CLI never needs esbuild or a checkout. */
export async function privateEvaluator(root) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/acceptance/private-executor.ts', root))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  })
  if (result.outputFiles[0].contents.length > 256 * 1024)
    throw new Error('Private evaluator bundle exceeds 256 KiB')
  return result.outputFiles[0].text
}
