/** Only controller-selected public witnesses enter this program; it never reads credential contents or changes project bytes. */
export const NATIVE_BOUNDARY_PROGRAM = `
import { readFileSync, openSync, closeSync } from 'node:fs'
import { connect } from 'node:net'
const input = JSON.parse(readFileSync(0, 'utf8'))
if (input.mode === 'cancel') {
  console.log(JSON.stringify({ ready: input.nonce }))
  setTimeout(() => process.exit(1), 60000)
} else {
  const access = (path, flags) => {
    let fd
    try { fd = openSync(path, flags); return 'allowed' }
    catch (error) { return ['EACCES', 'EPERM'].includes(error.code) ? 'denied' : 'unavailable' }
    finally { if (fd !== undefined) closeSync(fd) }
  }
  let read = false
  try { read = readFileSync(input.read, 'utf8') === input.nonce } catch {}
  const network = await new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port: input.port })
    const finish = value => { clearTimeout(timer); socket.destroy(); resolve(value) }
    const timer = setTimeout(() => finish(false), 300)
    socket.once('connect', () => finish(false))
    socket.once('error', error => finish(['EACCES', 'EPERM'].includes(error.code)))
  })
  console.log(JSON.stringify({
    nonce: input.nonce,
    read,
    privateDenied: access(input.private, 'r') === 'denied',
    credentialsDenied: access(input.credentials, 'r') === 'denied',
    workspaceWrite: access(input.workspace, 'r+'),
    outputWrite: access(input.output, 'r+'),
    networkDenied: network,
  }))
}
`
