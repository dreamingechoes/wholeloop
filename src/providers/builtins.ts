import docs from '../../harness/providers/local-docs/provider.json' with { type: 'json' }
import tracker from '../../harness/providers/local-tracker/provider.json' with { type: 'json' }
import code from '../../harness/providers/native-code/provider.json' with { type: 'json' }
import web from '../../harness/providers/native-web/provider.json' with { type: 'json' }
import { validateProvider } from './manifest.js'

export const BUILTINS = [docs, tracker, code, web].map((value) => {
  validateProvider(value)
  return value
})
