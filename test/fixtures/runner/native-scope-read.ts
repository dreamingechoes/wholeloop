import { writeSync } from 'node:fs'
import { SourceInputError } from '../../../src/delivery/input.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { StoreFiles } from '../../../src/state/files.js'

const root = process.argv[2]
if (!root) throw new Error('Supply the owned external fixture store')
const scope = new RunnerNativeScope(new StoreFiles(root), 'a'.repeat(64))
writeSync(process.stdout.fd, 'reader-ready\n')
try {
  scope.calls()
  writeSync(process.stdout.fd, 'reader-returned\n')
} catch (error) {
  if (!(error instanceof SourceInputError) || error.problem !== 'unsafe-file') throw error
  writeSync(process.stdout.fd, 'reader-refused\n')
}
