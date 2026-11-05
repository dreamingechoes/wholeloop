import events from 'node:events'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// A test preloader, never a runtime option or security boundary of the product.
const canonical = (value) => {
  let path = resolve(value),
    suffix = []
  while (!fs.existsSync(path) && dirname(path) !== path) {
    suffix.push(basename(path))
    path = dirname(path)
  }
  return resolve(fs.realpathSync(path), ...suffix.reverse())
}
const root = canonical(process.env.WHOLELOOP_TEST_STORE)
const target = (value) => {
  if (value instanceof URL) value = fileURLToPath(value)
  if (Buffer.isBuffer(value)) value = value.toString()
  if (typeof value !== 'string') return false
  const delta = relative(root, canonical(value))
  return delta === '' || (delta !== '..' && !delta.startsWith(`..${sep}`) && !isAbsolute(delta))
}
let writes = 0,
  listeners = 0
const refuse = () => {
  writes++
  throw new Error('TEST GUARD: store mutation refused')
}
const operations = [
  'writeFile',
  'appendFile',
  'mkdir',
  'rmdir',
  'rm',
  'unlink',
  'truncate',
  'chmod',
  'chown',
  'utimes',
  'mkdtemp',
]
for (const name of operations) {
  for (const suffix of ['', 'Sync']) {
    const original = fs[name + suffix]
    if (!original) continue
    fs[name + suffix] = function (path, ...args) {
      if (target(path)) refuse()
      return Reflect.apply(original, this, [path, ...args])
    }
  }
  const original = fs.promises[name]
  if (original)
    fs.promises[name] = function (path, ...args) {
      if (target(path)) refuse()
      return Reflect.apply(original, this, [path, ...args])
    }
}
for (const name of ['rename', 'link', 'symlink', 'copyFile', 'cp']) {
  for (const suffix of ['', 'Sync']) {
    const original = fs[name + suffix]
    if (!original) continue
    fs[name + suffix] = function (from, to, ...args) {
      if (target(from) || target(to)) refuse()
      return Reflect.apply(original, this, [from, to, ...args])
    }
  }
  const original = fs.promises[name]
  if (original)
    fs.promises[name] = function (from, to, ...args) {
      if (target(from) || target(to)) refuse()
      return Reflect.apply(original, this, [from, to, ...args])
    }
}
const writeFlags = (flags) =>
  typeof flags === 'number'
    ? (flags &
        (fs.constants.O_WRONLY |
          fs.constants.O_RDWR |
          fs.constants.O_CREAT |
          fs.constants.O_TRUNC |
          fs.constants.O_APPEND)) !==
      0
    : /[wa+]/.test(flags)
for (const name of ['open', 'openSync']) {
  const original = fs[name]
  fs[name] = function (path, flags, ...args) {
    if (target(path) && writeFlags(flags)) refuse()
    return Reflect.apply(original, this, [path, flags, ...args])
  }
}
const open = fs.promises.open
fs.promises.open = function (path, flags, ...args) {
  if (target(path) && writeFlags(flags)) refuse()
  return Reflect.apply(open, this, [path, flags, ...args])
}
const stream = fs.createWriteStream
fs.createWriteStream = function (path, ...args) {
  if (target(path)) refuse()
  return Reflect.apply(stream, this, [path, ...args])
}
net.Server.prototype.listen = () => {
  listeners++
  throw new Error('TEST GUARD: listener refused')
}
if (process.env.WHOLELOOP_TEST_DRAIN_WAIT === '1') {
  process.stdout.on('error', (error) => fs.writeSync(2, `OUTPUT ERROR ${error.code}\n`))
  const once = events.once
  events.once = (emitter, name, ...args) => {
    if (emitter === process.stdout && name === 'drain') fs.writeSync(2, 'DRAIN WAIT\n')
    return once(emitter, name, ...args)
  }
}
if (process.env.WHOLELOOP_TEST_FS_WAKE === '1') {
  const watch = fs.watch
  fs.watch = function (...args) {
    fs.writeSync(2, 'FS WATCH\n')
    const index = args.length - 1,
      listener = args[index]
    if (typeof listener === 'function')
      args[index] = (...values) => {
        fs.writeSync(2, 'FS HINT\n')
        listener(...values)
      }
    return Reflect.apply(watch, this, args)
  }
}
syncBuiltinESMExports()
process.once('exit', () => {
  if (writes || listeners) {
    fs.writeSync(2, `READ GUARD FAIL (${writes} writes, ${listeners} listeners)\n`)
    process.exitCode = 1
  } else fs.writeSync(2, 'READ GUARD PASS (0 writes, 0 listeners)\n')
})
