// The fixed wrapper owns its group even if its controller dies. Recovery cancels
// through a private file; only the live wrapper signals its own process group.
export const DOCKER_OPERATION_WRAPPER = `
import { spawn } from 'node:child_process'
import { existsSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
let text = '', child, request, stopping = false, stopReason
const bootstrap = setTimeout(() => process.exit(2), 5000)
const atomic = (path, value) => {
  const temporary = path + '.' + process.pid + '.tmp'
  const fd = openSync(temporary, 'wx', 384)
  try { writeFileSync(fd, JSON.stringify(value) + '\\n'); fsyncSync(fd) }
  finally { closeSync(fd) }
  renameSync(temporary, path)
  const directory = openSync(dirname(path), 'r')
  try { fsyncSync(directory) } finally { closeSync(directory) }
}
const outcome = (code, signal, reason) => atomic(request.outcome, {
  schema: 'wholeloop/environment-operation-outcome@1', operation: request.operation,
  nonce: request.nonce, pid: process.pid, ...(code !== null ? { code } : {}),
  ...(signal ? { signal } : {}), reason, at: new Date().toISOString(),
})
const stop = reason => {
  if (stopping) return
  stopping = true
  stopReason = reason
  try { child?.kill('SIGTERM') } catch {}
  setTimeout(() => {
    try { process.kill(-process.pid, 'SIGKILL') } catch { process.exit(1) }
  }, 300)
}
process.on('SIGTERM', () => stop('cancelled'))
process.on('SIGINT', () => stop('cancelled'))
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  text += chunk
  if (text.length > 100663296) process.exit(2)
})
process.stdin.on('end', () => {
  clearTimeout(bootstrap)
  if (!text) process.exit(2)
  request = JSON.parse(text)
  if (existsSync(request.cancel)) { outcome(null, null, 'not-started'); process.exit(2) }
  child = spawn(request.command, request.args, {
    shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: process.env,
  })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  child.stdin.on('error', () => {})
  child.stdin.end(request.input)
  child.once('error', () => { outcome(null, null, 'launch-failed'); process.exit(1) })
  child.once('close', (code, signal) => {
    outcome(code, signal, stopping ? stopReason : 'finished')
    if (!stopping) process.exit(code === 0 && !signal ? 0 : 1)
  })
  const watch = setInterval(() => { if (existsSync(request.cancel)) stop('cancelled') }, 50)
  const timer = setTimeout(() => stop('timeout'), request.timeoutMs)
  child.once('close', () => { clearInterval(watch); clearTimeout(timer) })
})
`
