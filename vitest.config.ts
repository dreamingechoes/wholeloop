import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: { __WL_VERSION__: JSON.stringify(version) },
  // Process/Git integration fixtures already exercise concurrency internally.
  // Bound file workers so CPU contention does not consume their timeout budget.
  test: { include: ['test/**/*.test.ts'], maxWorkers: 2 },
})
