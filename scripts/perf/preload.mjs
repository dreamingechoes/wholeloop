// Measurement-only preload for performance investigations (P7-04).
//
// Load it with NODE_OPTIONS="--import <this file>" and WHOLELOOP_PERF_OUTPUT
// set to an existing absolute directory. It counts synchronous filesystem
// calls, process launches by command family, JSON parse/stringify and, when
// WHOLELOOP_PERF_CALLERS=1, the calling functions; phases follow the delivery
// runner's own stage events. It records no argument, path, environment value,
// prompt, credential or body: only operation names, counts, intervals, command
// families and function names. Nothing in the published CLI loads it.
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { basename, isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url),
  fs = require('node:fs'),
  cp = require('node:child_process')
const destination = process.env.WHOLELOOP_PERF_OUTPUT
if (destination) {
  if (!isAbsolute(destination) || !fs.statSync(destination).isDirectory())
    throw new Error('WHOLELOOP_PERF_OUTPUT must be an existing absolute directory')
  const callers = process.env.WHOLELOOP_PERF_CALLERS === '1'
  const rawWrite = fs.writeFileSync,
    parse = JSON.parse,
    stringify = JSON.stringify
  const counts = {},
    phases = {},
    attribution = {},
    transitions = []
  const started = performance.now(),
    cpu = process.cpuUsage()
  const peak = { rss: 0, heapUsed: 0 }
  const sample = () => {
    const usage = process.memoryUsage()
    peak.rss = Math.max(peak.rss, usage.rss)
    peak.heapUsed = Math.max(peak.heapUsed, usage.heapUsed)
  }
  setInterval(sample, 50).unref()
  const STAGES = new Set([
    'plan',
    'acceptance-definition',
    'workspace',
    'build-plan',
    'implementation',
    'commit',
    'verification',
    'review',
    'reverification',
    'integration',
    'acceptance',
    'publication',
    'handoff',
  ])
  const GIT = new Set([
    'rev-parse',
    'ls-files',
    'ls-tree',
    'cat-file',
    'status',
    'branch',
    'worktree',
    'merge-base',
    'rev-list',
    'config',
    'remote',
    'diff',
    'show',
    'log',
    'init',
    'add',
    'commit',
    'merge',
    'push',
    'fetch',
    'checkout',
    'switch',
  ])
  const DOCKER = new Set([
    'info',
    'version',
    'context',
    'inspect',
    'container',
    'image',
    'network',
    'volume',
    'logs',
    'wait',
    'create',
    'start',
    'stop',
    'rm',
    'pull',
    'exec',
    'build',
    'ls',
  ])
  const CLIENTS = new Set([
    'git',
    'docker',
    'node',
    'claude',
    'codex',
    'opencode',
    'copilot',
    'agent',
    'gemini',
    'agy',
    'ps',
  ])
  // High-frequency calls are attributed one in eight to keep the stack walk cheap.
  const SAMPLED = new Set([
    'fs.existsSync',
    'fs.lstatSync',
    'fs.statSync',
    'fs.realpathSync',
    'JSON.parse',
    'JSON.stringify',
  ])
  let phase = 'bootstrap',
    overflow = 0,
    callerOverflow = 0,
    attributed = 0,
    tick = 0
  const watermarks = new Map()
  // Families only: the first argument naming a subcommand, never its operands.
  const family = (command, args = []) => {
    const name = basename(String(command)),
      kind = CLIENTS.has(name) ? name : 'other'
    if (kind === 'git') return `git.${args.find((value) => GIT.has(value)) ?? 'other'}`
    if (kind === 'docker')
      return `docker.${args
        .slice(0, 2)
        .map((value) => (DOCKER.has(value) ? value : 'other'))
        .join('.')}`
    return kind
  }
  const caller = () => {
    const frames = (new Error().stack ?? '').split('\n').slice(3, 21)
    const names = frames
      .map((line) => /^\s*at (?:async )?([A-Za-z0-9_$.<>]+) \(/.exec(line)?.[1])
      .filter((name) => name && !name.startsWith('Object.') && name !== 'Reflect.apply')
      .slice(0, 6)
    return names.length ? names.join(' < ') : 'anonymous'
  }
  const add = (name, elapsed, selected) => {
    if (!phases[selected]) phases[selected] = {}
    for (const bucket of [counts, phases[selected]]) {
      if (!bucket[name]) bucket[name] = { calls: 0, inclusiveMilliseconds: 0 }
      const entry = bucket[name]
      entry.calls++
      entry.inclusiveMilliseconds += elapsed
    }
    if (!callers || (SAMPLED.has(name) && tick++ % 8)) return
    const key = `${selected}\0${name} @ ${caller()}`
    const entry = attribution[key]
    if (entry) entry.calls += SAMPLED.has(name) ? 8 : 1
    else if (attributed < 65536) {
      attributed++
      attribution[key] = { operation: name, phase: selected, calls: SAMPLED.has(name) ? 8 : 1 }
    } else callerOverflow++
  }
  const timed = (name, operation) =>
    function (...args) {
      const begin = performance.now(),
        selected = phase
      try {
        return Reflect.apply(operation, this, args)
      } finally {
        add(name, performance.now() - begin, selected)
      }
    }
  // Phase changes follow the runner's own journal writes of stage events.
  const stageWrite = (data) => {
    if (
      !(typeof data === 'string' || Buffer.isBuffer(data)) ||
      Buffer.byteLength(data) > 8 * 1024 * 1024
    )
      return
    const text = typeof data === 'string' ? data : data.toString('utf8')
    if (!text.includes('"schema":"wholeloop/delivery-runner-event@1"')) return
    for (const line of text.split('\n'))
      try {
        const event = parse(line),
          payload = event?.payload
        if (
          payload?.schema !== 'wholeloop/delivery-runner-event@1' ||
          typeof payload.stage !== 'string'
        )
          continue
        // Packed ranges re-emit older events; a phase never moves backwards.
        if (typeof event.run === 'string' && Number.isSafeInteger(event.sequence)) {
          if (event.sequence <= (watermarks.get(event.run) ?? 0)) continue
          watermarks.set(event.run, event.sequence)
        }
        const selected = payload.stage.split(':')[0]
        if (!STAGES.has(selected)) continue
        const prior = phase
        if (['prepared', 'dispatched', 'started'].includes(payload.action)) phase = selected
        else if (
          payload.action === 'observed' &&
          payload.stage === 'handoff' &&
          payload.status === 'passed'
        )
          phase = 'endpoint'
        if (phase !== prior) {
          if (transitions.length < 256)
            transitions.push({ phase, milliseconds: performance.now() - started })
          else overflow++
        }
      } catch {}
  }
  for (const name of [
    'accessSync',
    'existsSync',
    'statSync',
    'lstatSync',
    'fstatSync',
    'realpathSync',
    'readdirSync',
    'openSync',
    'closeSync',
    'readFileSync',
    'readSync',
    'mkdirSync',
    'writeFileSync',
    'writeSync',
    'renameSync',
    'unlinkSync',
    'rmSync',
    'fsyncSync',
  ]) {
    const original = fs[name],
      measured = timed(`fs.${name}`, original)
    const wrapped =
      name === 'writeFileSync'
        ? function (...args) {
            stageWrite(args[1])
            return Reflect.apply(measured, this, args)
          }
        : measured
    for (const key of Reflect.ownKeys(original))
      if (!['length', 'name', 'arguments', 'caller', 'prototype'].includes(key))
        Object.defineProperty(wrapped, key, Object.getOwnPropertyDescriptor(original, key))
    fs[name] = wrapped
  }
  for (const name of ['spawnSync', 'execFileSync', 'execFile', 'spawn']) {
    const original = cp[name]
    cp[name] = function (command, args = [], ...rest) {
      const list = Array.isArray(args) ? args : []
      return Reflect.apply(timed(`process.${name}.${family(command, list)}`, original), this, [
        command,
        args,
        ...rest,
      ])
    }
  }
  JSON.parse = timed('JSON.parse', JSON.parse)
  JSON.stringify = timed('JSON.stringify', JSON.stringify)
  syncBuiltinESMExports()
  process.once('exit', (code) => {
    sample()
    const script = basename(process.argv[1] ?? '')
    const role = ['wl.mjs', 'wl-runner.mjs', 'runner.mjs'].includes(script) ? script : 'other'
    const report = {
      schema: 'wholeloop/perf-profile@1',
      scope:
        'Instrumented API counts and inclusive intervals per phase. Timings include profiler cost and are not uninstrumented latency. No argument, path, environment value, prompt, credential or body is retained.',
      role,
      pid: process.pid,
      parent: process.ppid,
      code,
      wallMilliseconds: performance.now() - started,
      cpuMicroseconds: process.cpuUsage(cpu),
      peakBytes: peak,
      counts,
      phases,
      transitions,
      ...(callers ? { callers: attribution, callerOverflow } : {}),
      overflow,
    }
    rawWrite(join(destination, `profile-${process.pid}.json`), `${stringify(report, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    })
  })
}
