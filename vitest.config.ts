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
  // Process/Git integration fixtures already exercise concurrency internally.
  // Bound file workers so CPU contention does not consume their timeout budget.
  // Most files also run Git/worktree/process integration. Allow setup and cleanup
  // under contention; product deadline assertions retain their explicit budgets.
  test: { include: ['test/**/*.test.ts'], maxWorkers: 2, testTimeout: 30000 },
})
