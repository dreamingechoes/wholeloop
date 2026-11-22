// Runs a test suite at most once per intent, including after an ambiguous crash.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import { chosenImage, executionChoice, NOT_ISOLATED } from '../execution/choice.js'
import {
  type DockerCall,
  DockerUnavailableError,
  dockerCli,
  dockerEnvironment,
  ensureSandbox,
  sandboxArgv,
  stopSandbox,
} from '../execution/docker.js'
import type { FlowEngine } from '../flow/engine.js'
import { gateAssignments } from '../gates/assignments.js'
import type { GatePlan, GateResult } from '../gates/contracts.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { canonicalPath, inside } from '../state/paths.js'
import { workerModels } from '../workers/models.js'
import type { SuiteExecution, SuitePlan, SuiteResult } from './contracts.js'
import {
  namedSuiteHashes,
  SuiteStartError,
  type SuiteStartFailure,
  startupCode,
  suiteOutputTail,
} from './start.js'
import { verificationRuns } from './state.js'

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

function execute(
  root: string,
  command: SuitePlan['commands'][number],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
) {
  return new Promise<{
    receipt: SuiteResult['commands'][number]
    output: { ref: string; stdout: string; stderr: string }
    spawnCode?: string
  }>((resolve) => {
    let stdout = ''
    let stderr = ''
    const stdoutHash = createHash('sha256')
    const stderrHash = createHash('sha256')
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let size = 0
    let stopped = false
    let spawnCode: string | undefined
    const codeFor = (error: unknown) => {
      const code = (error as NodeJS.ErrnoException)?.code
      return typeof code === 'string' && /^E[A-Z0-9_]+$/.test(code) ? code : 'SPAWN_ERROR'
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command.argv[0] ?? '', command.argv.slice(1), {
        cwd: join(root, command.cwd),
        ...(env ? { env } : {}),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({
        receipt: {
          ref: command.ref,
          exitCode: -1,
          signal: '',
          stdout: stdoutHash.digest('hex'),
          stderr: stderrHash.digest('hex'),
        },
        output: { ref: command.ref, stdout, stderr },
        spawnCode: codeFor(error),
      })
      return
    }
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
    child.stdout?.on('data', (buffer: Buffer) => receive('stdout', buffer))
    child.stderr?.on('data', (buffer: Buffer) => receive('stderr', buffer))
    child.on('error', (cause) => {
      const code = codeFor(cause)
      // A later process-group/kill error cannot recategorize executed code as an unused start.
      if (!child.pid) spawnCode = code
      const error = child.pid
        ? `Suite process error: ${code}`
        : `Suite executable could not start: ${code}`
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
        ...(spawnCode ? { spawnCode } : {}),
      })
    })
  })
}

export function suiteGateResult(
  result: SuiteResult,
  output?: readonly { stdout: string; stderr: string }[],
): GateResult {
  const tail = output ? suiteOutputTail(output) : ''
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
              evidence: [
                `status ${result.status}; unchanged ${result.unchanged}`,
                ...(tail ? [`Output tail (transient):\n${tail}`] : []),
              ],
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
  options: {
    refs?: string[]
    timeoutMs?: number
    /** The autonomous runner's own observed Docker executor, or a test double. */
    executor?: SuiteExecutor
    /** A person's per-run choice, `docker` or `host`; never accepted with an executor. */
    execution?: string
    image?: string
    docker?: DockerCall
  } = {},
) {
  const active = gateRuns(engine.store.events()).find(
    (entry) => entry.subject === subject && entry.run === run,
  )
  if (active?.unavailable) throw new SuiteStartError(active.unavailable)
  const gate = active?.rounds.at(-1)
  if (gate?.plan.gate !== 'verify' || gate.plan.round !== round || gate.decision)
    throw new Error('Run the suite in the current unsealed verify round')
  const plan = suitePlan(engine, gate.plan, options.refs, options.timeoutMs)
  const intended = verificationRuns(engine.store.events()).some(
    (entry) => entry.run === run && entry.round === round,
  )
  // Where code runs is settled, and Docker reached, before any intent is written (ADR-0257).
  // An existing intent is either cached or refused below, so it needs no placement.
  const placement = intended ? undefined : suitePlacement(engine, options, gate.plan.repository)
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
    if (placement?.record)
      append(subject, { type: 'verify.suite-execution', data: { run, round, ...placement.record } })
    return undefined
  })
  let result = cached
  const output: { ref: string; stdout: string; stderr: string }[] = []
  if (!result) {
    const commands: SuiteResult['commands'] = []
    let cause: SuiteStartFailure['cause'] | undefined
    for (const command of plan.commands) {
      const completed = await (placement?.executor ?? execute)(
        gate.plan.repository,
        command,
        plan.timeoutMs,
      )
      commands.push(completed.receipt)
      output.push(completed.output)
      const code = startupCode(completed.receipt, completed.spawnCode)
      if (code) cause = { ref: command.ref, executable: command.argv[0] ?? '', code }
      if (completed.receipt.exitCode !== 0 || completed.receipt.signal) break
    }
    const unchanged = workspaceSnapshot(gate.plan.repository).digest === gate.plan.snapshot.digest
    if (unchanged && cause) {
      const failure: SuiteStartFailure = { run, round, unchanged: true, commands, cause }
      engine.store.transaction((_events, append) => {
        if (workspaceSnapshot(gate.plan.repository).digest !== gate.plan.snapshot.digest)
          throw new Error('Workspace changed while recording the suite startup failure')
        append(subject, { type: 'verify.suite-unavailable', data: failure })
      })
      throw new SuiteStartError(failure)
    }
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
  const state = gateRuns(engine.store.events())
    .find((entry) => entry.run === run)
    ?.rounds.at(-1)
  const submitted = state?.results.find((entry) => entry.unit === 'suite')
  if (!submitted && result.unchanged) new GateWorkflow(engine).submit(subject, run, round, observed)
  else if (submitted && JSON.stringify(submitted) !== JSON.stringify(observed))
    throw new Error(
      'Suite was submitted with different observations; preserve the receipt and inspect the round',
    )
  const current = workspaceSnapshot(gate.plan.repository).digest === gate.plan.snapshot.digest
  const observation = { run, round, current, result, output }
  const execution = verificationRuns(engine.store.events()).find(
    (entry) => entry.run === run && entry.round === round,
  )?.execution
  return {
    schema: 'wholeloop/verify-suite@1',
    subject,
    run,
    round,
    cached: !!cached,
    current,
    result,
    output,
    ...(execution ? { execution: executionView(execution) } : {}),
    ...gateAssignments(gate.plan, {
      results: state?.results ?? [],
      votes: state?.votes ?? [],
      classifications: state?.classifications ?? [],
      suite: observation,
      models: workerModels(engine),
    }),
  }
}

/**
 * The runner passes its own owned Docker executor and records its environment separately; a host
 * choice there is refused. Supervised calls resolve Docker or an explicit host choice.
 */
function suitePlacement(
  engine: FlowEngine,
  options: Parameters<typeof runSuite>[4],
  workspace: string,
): { executor: SuiteExecutor; record?: Omit<SuiteExecution, 'run' | 'round'> } {
  if (options?.executor) {
    if (options.execution !== undefined || options.image !== undefined)
      throw new Error(
        'The autonomous runner always runs project code in its own Docker environment',
      )
    return { executor: options.executor }
  }
  const choice = executionChoice(engine.root, options?.execution)
  if (choice.isolation === 'host') return { executor: execute, record: choice }
  const image = chosenImage(engine.configuration().values.answers, options?.image)
  if (!image)
    throw new DockerUnavailableError(
      "Choose the container image that runs this repository's code: pass --image <name>, or remember it with wl setup --image <name> --scope project. Or choose host execution for this run with --execution host.",
    )
  const call = options?.docker ?? dockerCli
  const sandbox = ensureSandbox(workspace, image, call)
  return {
    record: { ...choice, image: sandbox.image, imageId: sandbox.imageId },
    executor: async (root, command, timeoutMs) => {
      const completed = await execute(
        root,
        { ...command, cwd: '.', argv: sandboxArgv(sandbox, command.cwd, command.argv) },
        timeoutMs,
        dockerEnvironment(),
      )
      // The client process was killed; the command inside the container must stop too.
      if (completed.receipt.signal) stopSandbox(workspace, call)
      return completed
    },
  }
}

/** Person-facing placement: Docker with its image, or the host stated as not isolated. */
export function executionView(execution: SuiteExecution) {
  return execution.isolation === 'docker'
    ? {
        isolation: 'docker' as const,
        source: execution.source,
        image: execution.image,
        imageId: execution.imageId,
      }
    : { isolation: 'host' as const, source: execution.source, note: NOT_ISOLATED }
}

/** Version two names hashes explicitly; the original response and durable readers stay intact. */
export function suiteResultV2(observation: Awaited<ReturnType<typeof runSuite>>) {
  return {
    ...observation,
    schema: 'wholeloop/verify-suite@2',
    result: { ...observation.result, commands: namedSuiteHashes(observation.result.commands) },
    findings: suiteGateResult(observation.result, observation.output).findings,
  }
}
