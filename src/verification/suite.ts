// Runs a test suite at most once per intent, including after an ambiguous crash.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import type { GatePlan, GateResult } from '../gates/contracts.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { canonicalPath, inside } from '../state/paths.js'
import type { SuitePlan, SuiteResult } from './contracts.js'

export function suitePlan(
  engine: FlowEngine,
  gate: GatePlan,
  refs?: string[],
  timeoutMs = 120000,
): SuitePlan {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000)
    throw new Error('Suite timeout must be 100–600000 milliseconds')
  const inventory = discover(gate.repository, engine.store.files, engine.home)
  const config = engine.config(gate.subject, 'verify-works', gate.run)
  const binding =
    isObject(config.slots) && typeof config.slots['verify.suite'] === 'string'
      ? config.slots['verify.suite']
      : undefined
  const resolution = resolveSlot('verify.suite', inventory.repo, {
    user: inventory.user,
    ...(binding ? { binding } : {}),
  })
  if (!resolution.selected) throw new Error('Resolve the verify.suite choice before execution')
  let selected = refs
  if (!selected) {
    const command = inventory.repo.commands.find(
      (command) => command.ref === resolution.selected?.ref,
    )
    if (!command)
      throw new Error(
        'Suite guidance needs host interpretation into explicit declared command references; no command was guessed',
      )
    const prefix = command.ref.split('#')[0]
    const target = command.ref.split('#')[1]
    selected = [
      command.ref,
      ...(!['check', 'verify'].includes(target ?? '')
        ? ['typecheck', 'lint'].flatMap((target) =>
            inventory.repo.commands
              .filter((entry) => entry.ref === `${prefix}#${target}`)
              .map((entry) => entry.ref),
          )
        : []),
    ]
  }
  if (!selected.length || new Set(selected).size !== selected.length)
    throw new Error('Select distinct declared suite commands')
  const commands = selected.map((ref) => {
    const command = inventory.repo.commands.find((entry) => entry.ref === ref)
    if (!command || !inside(gate.repository, canonicalPath(join(gate.repository, command.cwd))))
      throw new Error('Suite command is undeclared or escapes the workspace')
    return command
  })
  return { commands, timeoutMs }
}

function execute(root: string, command: SuitePlan['commands'][number], timeoutMs: number) {
  return new Promise<{
    receipt: SuiteResult['commands'][number]
    output: { ref: string; stdout: string; stderr: string }
  }>((resolve) => {
    let stdout = ''
    let stderr = ''
    const stdoutHash = createHash('sha256')
    const stderrHash = createHash('sha256')
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let size = 0
    let stopped = false
    const child = spawn(command.argv[0] ?? '', command.argv.slice(1), {
      cwd: join(root, command.cwd),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stop = () => {
      stopped = true
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL')
        }
      }
    }
    const timer = setTimeout(stop, timeoutMs)
    const receive = (kind: 'stdout' | 'stderr', buffer: Buffer) => {
      size += buffer.length
      if (size > 1024 * 1024) {
        stop()
        return
      }
      if (kind === 'stdout') {
        stdoutHash.update(buffer)
        stdout += stdoutDecoder.write(buffer)
      } else {
        stderrHash.update(buffer)
        stderr += stderrDecoder.write(buffer)
      }
    }
    child.stdout.on('data', (buffer: Buffer) => receive('stdout', buffer))
    child.stderr.on('data', (buffer: Buffer) => receive('stderr', buffer))
    child.on('error', () => {
      const error = 'Suite executable could not start'
      stderr += error
      stderrHash.update(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      stdout += stdoutDecoder.end()
      stderr += stderrDecoder.end()
      resolve({
        receipt: {
          ref: command.ref,
          exitCode: code ?? -1,
          signal: signal ?? (stopped ? 'SIGKILL' : ''),
          stdout: stdoutHash.digest('hex'),
          stderr: stderrHash.digest('hex'),
        },
        output: { ref: command.ref, stdout, stderr },
      })
    })
  })
}

export function suiteGateResult(result: SuiteResult): GateResult {
  return {
    unit: 'suite',
    status: 'ok',
    execution: { status: result.status === 'passed' ? 'passed' : 'failed' },
    evidence: result.commands.map(
      (command) =>
        `${command.ref}: exit ${command.exitCode}, signal ${command.signal || 'none'}, stdout sha256 ${command.stdout}, stderr sha256 ${command.stderr}`,
    ),
    findings:
      result.status === 'passed'
        ? []
        : [
            {
              id: 'suite-failed',
              location: 'verify.suite',
              text: result.unchanged
                ? 'Repository suite did not complete successfully'
                : 'Repository suite changed the observed workspace',
              evidence: [`status ${result.status}; unchanged ${result.unchanged}`],
            },
          ],
  }
}

export type SuiteExecutor = (
  root: string,
  command: SuitePlan['commands'][number],
  timeoutMs: number,
) => ReturnType<typeof execute>

/** Write-ahead intent provides at-most-once execution, including ambiguous crash recovery. */
export async function runSuite(
  engine: FlowEngine,
  subject: string,
  run: string,
  round: number,
  options: { refs?: string[]; timeoutMs?: number; executor?: SuiteExecutor } = {},
) {
  const gate = gateRuns(engine.store.events())
    .find((entry) => entry.subject === subject && entry.run === run)
    ?.rounds.at(-1)
  if (gate?.plan.gate !== 'verify' || gate.plan.round !== round || gate.decision)
    throw new Error('Run the suite in the current unsealed verify round')
  const plan = suitePlan(engine, gate.plan, options.refs, options.timeoutMs)
  const cached = engine.store.transaction((events, append) => {
    const matching = events.filter(
      (event) =>
        event.subject === subject &&
        'run' in event.data &&
        event.data.run === run &&
        'round' in event.data &&
        event.data.round === round,
    )
    const intent = matching.find((event) => event.type === 'verify.suite-planned')
    if (
      intent?.type === 'verify.suite-planned' &&
      (options.refs || options.timeoutMs !== undefined) &&
      JSON.stringify(intent.data.plan) !== JSON.stringify(plan)
    )
      throw new Error('Suite commands and timeout are already pinned for this round')
    const finished = matching.find((event) => event.type === 'verify.suite-finished')
    if (finished?.type === 'verify.suite-finished') return finished.data.result
    if (matching.some((event) => event.type === 'verify.suite-planned'))
      throw new Error(
        'Suite intent already exists; execution is running or interrupted. Inspect it and start a fresh gate round instead of rerunning',
      )
    if (workspaceSnapshot(gate.plan.repository).digest !== gate.plan.snapshot.digest)
      throw new Error('Workspace changed before suite execution')
    append(subject, { type: 'verify.suite-planned', data: { run, round, plan } })
    return undefined
  })
  let result = cached
  const output: { ref: string; stdout: string; stderr: string }[] = []
  if (!result) {
    const commands: SuiteResult['commands'] = []
    for (const command of plan.commands) {
      const completed = await (options.executor ?? execute)(
        gate.plan.repository,
        command,
        plan.timeoutMs,
      )
      commands.push(completed.receipt)
      output.push(completed.output)
      if (completed.receipt.exitCode !== 0 || completed.receipt.signal) break
    }
    const unchanged = workspaceSnapshot(gate.plan.repository).digest === gate.plan.snapshot.digest
    result = {
      commands,
      unchanged,
      status:
        unchanged && commands.every((entry) => entry.exitCode === 0 && !entry.signal)
          ? 'passed'
          : 'failed',
    }
    const durable = result
    engine.store.transaction((_events, append) =>
      append(subject, { type: 'verify.suite-finished', data: { run, round, result: durable } }),
    )
  }
  const observed = suiteGateResult(result)
  const submitted = gateRuns(engine.store.events())
    .find((entry) => entry.run === run)
    ?.rounds.at(-1)
    ?.results.find((entry) => entry.unit === 'suite')
  if (!submitted && result.unchanged) new GateWorkflow(engine).submit(subject, run, round, observed)
  else if (submitted && JSON.stringify(submitted) !== JSON.stringify(observed))
    throw new Error(
      'Suite was submitted with different observations; preserve the receipt and inspect the round',
    )
  return {
    schema: 'wholeloop/verify-suite@1',
    subject,
    run,
    round,
    cached: !!cached,
    current: workspaceSnapshot(gate.plan.repository).digest === gate.plan.snapshot.digest,
    result,
    output,
  }
}
