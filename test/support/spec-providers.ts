// Gives legacy analytics-labelled spec fixtures a real validated provider without changing history.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function installSpecProvider(user: string): void {
  const directory = join(user, 'providers', 'analytics')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'provider.json'),
    JSON.stringify({
      schema: 1,
      id: 'analytics',
      extends: 'builtin:posthog',
      name: 'Fixture analytics',
    }),
  )
}
