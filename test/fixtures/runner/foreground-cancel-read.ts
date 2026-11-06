import { writeSync } from 'node:fs'
import { ForegroundOwner } from '../../../src/runner/foreground-owner.js'
import { RunnerStore } from '../../../src/runner/store.js'

const root = process.argv[2]
if (!root) throw new Error('Supply the owned external fixture store')
const store = new RunnerStore(root)
const owner = new ForegroundOwner(store, {
  request: 'a'.repeat(64),
  controller: `controller-${'b'.repeat(32)}`,
  generation: 1,
})
// Only isolate the cancellation reader; this fixture proves no live ownership.
store.current = () => true
writeSync(process.stdout.fd, 'reader-ready\n')
writeSync(process.stdout.fd, owner.current() ? 'reader-admitted\n' : 'reader-refused\n')
