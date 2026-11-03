import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { NATIVE_BINDINGS_DEFAULT, validNativeBindings } from '../delivery/native-bindings.js'
import { validNativeRuntime } from '../delivery/native-runtime.js'
import { controllerBundle, RECONCILE_ARGUMENT } from '../runner/controller-bundle.js'
import { DeliveryRunner } from '../runner/engine.js'
import { OwnedForegroundRunner, receiveOwnedForeground } from '../runner/foreground.js'
import { type RunnerHumanDecision, RunnerHumanDecisions } from '../runner/human-decisions.js'
import {
  type PublicHostComposer,
  publicRunnerIdentity,
  RunnerPublicHost,
  retainedPublicBindings,
  retainPublicBindings,
} from '../runner/public-host.js'
import { DeliveryRunnerError } from '../runner/route.js'
import event from '../runner/schemas/event-v1.json' with { type: 'json' }
import facet from '../runner/schemas/facet-v1.json' with { type: 'json' }
import processOutcome from '../runner/schemas/process-outcome-v1.json' with { type: 'json' }
import request from '../runner/schemas/request-v1.json' with { type: 'json' }
import observation from '../runner/schemas/stage-observation-v1.json' with { type: 'json' }
import status from '../runner/schemas/status-v1.json' with { type: 'json' }
import { RunnerStore } from '../runner/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

/** Preparation and controls never select an arbitrary executable or import host results. */
export function deliveryRunnerCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (command === 'delivery runner-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-runner-schema@1',
          contracts: { request, event, facet, observation, processOutcome, status },
          executed: false,
          completeRouteAvailable: false,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  if (command === 'delivery runner-host') {
    // Computes only; documents are retained when a run or reconcile names them.
    const { bindings, runtime } = publicDocuments(options, root)
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-runner-host@1',
          host: publicRunnerIdentity(bindings, runtime),
          runtime: runtime !== undefined,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  try {
    const store = new RunnerStore(
      typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
    )
    if (command === 'delivery human-decide') {
      const value = (name: string) => {
        const option = options[name]
        if (typeof option !== 'string') throw new CliError(`Provide ${name}`, EXIT.input)
        return option
      }
      const outcome = value('--outcome'),
        decision = value('--decision')
      if (!['accept', 'reject'].includes(outcome))
        throw new CliError('Provide --outcome accept or reject', EXIT.input)
      if (!['delivery-plan', 'approve-build-plan', 'acceptance'].includes(decision))
        throw new CliError('Provide a supported --decision', EXIT.input)
      // The operator command is the only human channel; workers cannot write this record.
      const recorded = new RunnerHumanDecisions(store).record({
        request: value('--digest'),
        stage: value('--stage'),
        decision: decision as RunnerHumanDecision,
        subject: value('--subject'),
        outcome: outcome as 'accept' | 'reject',
        by: value('--operator'),
        ...(typeof options['--note'] === 'string' ? { note: options['--note'] } : {}),
      })
      io.out(JSON.stringify(recorded, null, json ? undefined : 2))
      return EXIT.ok
    }
    let receipt: ReturnType<RunnerStore['inspect']>
    if (command === 'delivery runner-prepare') {
      const file = options['--file'],
        boundary = options['--root']
      if (typeof file !== 'string') throw new CliError('Provide --file <request.json>', EXIT.input)
      receipt = store.prepare(
        JSON.parse(
          readSourceFile(
            typeof boundary === 'string' ? resolve(root, boundary) : root,
            file,
            1024 * 1024,
          ),
        ),
      )
    } else {
      const digest = options['--digest']
      if (typeof digest !== 'string') throw new CliError('Provide --digest <sha256>', EXIT.input)
      const operation = command.slice('delivery '.length)
      if (operation === 'runner-status') receipt = store.inspect(digest)
      else {
        if (!['pause', 'resume', 'stop'].includes(operation))
          throw new CliError('Unsupported runner control', EXIT.input)
        const operator = options['--operator']
        if (typeof operator !== 'string')
          throw new CliError('Provide --operator <person>', EXIT.input)
        receipt = store.control(digest, operation as 'pause' | 'resume' | 'stop', operator)
      }
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return receipt.problems.length ? EXIT.precondition : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      `Delivery runner unavailable${error instanceof DeliveryRunnerError ? `: ${error.problem}` : ''}; retain original work and inspect the external store; contents omitted`,
      EXIT.precondition,
    )
  }
}

/** Bounded, validated public host documents; the empty bindings default trusts no client. */
function publicDocuments(options: ReturnType<typeof parseArguments>['options'], root: string) {
  const boundary = options['--root'],
    base = typeof boundary === 'string' ? resolve(root, boundary) : root,
    read = (name: '--bindings' | '--runtime') => {
      const file = options[name]
      if (typeof file !== 'string') return undefined
      try {
        return JSON.parse(readSourceFile(base, file, 65536)) as unknown
      } catch {
        throw new CliError(`Provide a readable ${name} document`, EXIT.input)
      }
    }
  const bindings = read('--bindings') ?? NATIVE_BINDINGS_DEFAULT,
    runtime = read('--runtime')
  if (!validNativeBindings(bindings))
    throw new CliError('Provide a valid wholeloop/native-bindings@1 document', EXIT.input)
  if (runtime !== undefined && !validNativeRuntime(runtime))
    throw new CliError('Provide a valid wholeloop/native-runtime@1 document', EXIT.input)
  return { bindings, runtime }
}

/** The installed core is the only controller; bindings choose clients and never containment. */
export async function deliveryRunnerAsyncCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
  core: string,
) {
  const digest = options['--digest']
  if (typeof digest !== 'string') throw new CliError('Provide --digest <sha256>', EXIT.input)
  const { bindings, runtime } = publicDocuments(options, root)
  try {
    const store = new RunnerStore(
        typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
      ),
      identity = retainPublicBindings(store, bindings, runtime),
      request = store.get(digest)
    if (contractDigest(request.host) !== contractDigest(identity))
      throw new DeliveryRunnerError('runner-host-binding')
    const host = new RunnerPublicHost(store, bindings, runtime)
    if (command === 'delivery reconcile') {
      // A run the controller bundle composed is reconciled by that bundle, the
      // only code that can inspect or stop its stages (ADR-0205).
      const bundle = controllerBundle(core),
        cancel = options['--cancel'] === true,
        { recoveryProblems, ...status } = bundle
          ? await bundleReconcile(bundle, store.files.root, digest, cancel)
          : await new DeliveryRunner(store).reconcile(digest, host, { cancel })
      io.out(
        JSON.stringify(
          { schema: 'wholeloop/delivery-runner-reconcile@1', status, recoveryProblems },
          null,
          json ? undefined : 2,
        ),
      )
      return recoveryProblems.length ? EXIT.precondition : EXIT.ok
    }
    // Read-only and deterministic: the controller child evaluates it again before dispatch.
    let preflight: Awaited<ReturnType<RunnerPublicHost['preflight']>> | null = null
    try {
      preflight = await host.preflight(
        request,
        store.basis(request).plan,
        store.inspect(digest).route,
        new AbortController().signal,
      )
    } catch {
      preflight = null
    }
    const abort = new AbortController(),
      relay = () => abort.abort()
    process.once('SIGINT', relay)
    process.once('SIGTERM', relay)
    try {
      // The verified controller bundle, when installed, is the owned child.
      const { status } = await new OwnedForegroundRunner(store).run(
        digest,
        controllerBundle(core) ?? core,
        {
          signal: abort.signal,
        },
      )
      io.out(
        JSON.stringify(
          { schema: 'wholeloop/delivery-runner-run@1', status, preflight },
          null,
          json ? undefined : 2,
        ),
      )
      return status.state === 'completed' ? EXIT.ok : EXIT.precondition
    } finally {
      process.off('SIGINT', relay)
      process.off('SIGTERM', relay)
    }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      `Delivery runner unavailable${error instanceof DeliveryRunnerError ? `: ${error.problem}` : ''}; retain original work and inspect the external store; contents omitted`,
      EXIT.precondition,
    )
  }
}

const RECONCILE_LIMIT = 2 * 1024 * 1024
/** Runs the verified bundle's reconcile mode and returns its bounded, parsed result. */
async function bundleReconcile(bundle: string, store: string, digest: string, cancel: boolean) {
  const child = spawn(process.execPath, [bundle, RECONCILE_ARGUMENT], {
    stdio: ['pipe', 'pipe', 'ignore'],
    shell: false,
  })
  let text = ''
  child.stdout.on('data', (chunk: Buffer) => {
    if (text.length <= RECONCILE_LIMIT) text += chunk.toString('utf8')
  })
  child.stdin.end(JSON.stringify({ store, digest, cancel }))
  const code = await new Promise<number | null>((done) => {
    child.once('error', () => done(null))
    child.once('close', done)
  })
  let value: { status?: unknown; recoveryProblems?: unknown; problem?: unknown }
  try {
    value = JSON.parse(text)
  } catch {
    throw new DeliveryRunnerError('runner-reconcile-bundle')
  }
  if (code !== 0 || typeof value.status !== 'object' || !Array.isArray(value.recoveryProblems))
    throw new DeliveryRunnerError(
      typeof value.problem === 'string' && /^[a-z0-9-]{1,80}$/.test(value.problem)
        ? value.problem
        : 'runner-reconcile-bundle',
    )
  return {
    ...(value.status as Record<string, unknown>),
    recoveryProblems: value.recoveryProblems as string[],
  }
}

/**
 * Bundle-only reconcile mode: one bounded input naming a store and a digest.
 * The host is rebuilt from the retained documents the request's identity names.
 */
export async function deliveryReconcileChild(composer: PublicHostComposer) {
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk
    if (Buffer.byteLength(text) > 65536) return EXIT.input
  }
  try {
    const value = JSON.parse(text) as { store?: unknown; digest?: unknown; cancel?: unknown }
    if (typeof value.store !== 'string' || typeof value.digest !== 'string') return EXIT.input
    const store = new RunnerStore(value.store),
      request = store.get(value.digest),
      configuration = retainedPublicBindings(store, request.host),
      host = new RunnerPublicHost(store, configuration.bindings, configuration.runtime, composer),
      { recoveryProblems, ...status } = await new DeliveryRunner(store).reconcile(
        value.digest,
        host,
        { cancel: value.cancel === true },
      )
    process.stdout.write(JSON.stringify({ status, recoveryProblems }))
    return EXIT.ok
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        problem: error instanceof DeliveryRunnerError ? error.problem : 'runner-reconcile-bundle',
      }),
    )
    return EXIT.precondition
  }
}

/**
 * Private controller mode: one bounded input, consumed once inside its owned
 * group. Only the controller bundle passes a composer; the core composes none.
 */
export async function deliveryForegroundChild(core: string, composer?: PublicHostComposer) {
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk
    if (Buffer.byteLength(text) > 65536) return EXIT.input
  }
  const value = JSON.parse(text) as { store?: unknown },
    status = await receiveOwnedForeground(value, core, (request) => {
      const store = new RunnerStore(String(value.store)),
        configuration = retainedPublicBindings(store, request.host)
      return new RunnerPublicHost(store, configuration.bindings, configuration.runtime, composer)
    })
  return status.state === 'completed' ? EXIT.ok : EXIT.precondition
}
