import { readFileSync, writeFileSync } from 'node:fs'
import { DockerCli } from '../../../src/environment/docker-command.js'
import {
  EnvironmentLifecycle,
  type EnvironmentLifecycleRequest,
} from '../../../src/environment/lifecycle.js'
import { StoreFiles } from '../../../src/state/files.js'

const [store, file, output, fault] = process.argv.slice(2)
if (!store || !file || !output)
  throw new Error('Provide retained disposable store, request and output paths')
const driver = new DockerCli()
const call = driver.call.bind(driver)
driver.call = async (args, options) => {
  const result = await call(args, options)
  if (
    fault === 'after-remove' &&
    args[0] === 'container' &&
    args[1] === 'rm' &&
    result.status === 'succeeded'
  ) {
    writeFileSync(output, JSON.stringify({ resource: args.at(-1), evidence: result.digest }))
    // This process owns itself. The next controller must recover without signaling this stored PID.
    process.kill(process.pid, 'SIGKILL')
  }
  return result
}
const request = JSON.parse(readFileSync(file, 'utf8')) as EnvironmentLifecycleRequest
const receipt = await new EnvironmentLifecycle(new StoreFiles(store), driver).execute(request)
writeFileSync(output, JSON.stringify(receipt))
if (receipt.state === 'unknown') process.exitCode = 1
