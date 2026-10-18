import { runAsync } from './main.js'

process.exitCode = await runAsync(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
})
