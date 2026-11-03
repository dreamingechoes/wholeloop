import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { harnessAssets } from './scripts/harness-assets.mjs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: {
    __WL_VERSION__: JSON.stringify(version),
    __WL_HARNESS__: JSON.stringify(harnessAssets(fileURLToPath(new URL('./', import.meta.url)))),
  },
  // Most files run real Git, worktree and process integration, so the suite is
  // CPU-bound. Measured on a 10-core machine (2026-11-03): 2 workers took 965 s,
  // 4 took 685 s, 6 took 623 s but timed out seven contention-sensitive cases.
  // Four workers with a 60 s default keep setup and cleanup within budget;
  // product deadline assertions retain their own explicit budgets.
  test: { include: ['test/**/*.test.ts'], maxWorkers: 4, testTimeout: 60000 },
})
