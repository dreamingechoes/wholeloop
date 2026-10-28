import { basename } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { withWorkerOwnership } from '../fanout/ownership.js'
import { unmanagedWorkerProcess } from '../fanout/process.js'
import type { StoreFiles } from '../state/files.js'
import { ManagedRunnerProcess } from './native-process.js'
import { DeliveryRunnerError } from './route.js'

export const REFERENCE_NATIVE_COMMANDS = [
  'claude',
  'codex',
  'opencode',
  'copilot',
  'agent',
  'gemini',
  'agy',
] as const
interface NativeCall {
  invocation: string
  command: string
  index: number
  status: 'issued' | 'closed' | 'unknown'
}
/** A stage's private manifest retains every native group, including independent read-only gate workers. */
export class RunnerNativeScope {
  constructor(
    readonly files: StoreFiles,
    readonly stage: string,
    readonly clients: readonly string[] = REFERENCE_NATIVE_COMMANDS,
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(stage) ||
      clients.some((client) => !client || basename(client) !== client)
    )
      throw new DeliveryRunnerError('invalid-native-owner-scope')
  }
  private get path() {
    return `delivery/runner-native-scopes/${this.stage}.json`
  }
  calls(): NativeCall[] {
    const body = this.files.read(this.path)
    if (!body) return []
    const value = JSON.parse(readSourceFile(this.files.root, this.path, 1024 * 1024))
    if (
      value.stage !== this.stage ||
      !Array.isArray(value.calls) ||
      value.calls.length > 1000 ||
      value.calls.some(
        (call: NativeCall, index: number) =>
          call.index !== index ||
          !/^[a-f0-9]{64}$/.test(call.invocation) ||
          !['issued', 'closed', 'unknown'].includes(call.status) ||
          typeof call.command !== 'string' ||
          !this.clients.includes(call.command),
      )
    )
      throw new DeliveryRunnerError('damaged-native-owner-scope')
    return value.calls
  }
  private write(calls: NativeCall[]) {
    this.files.atomic(this.path, JSON.stringify({ stage: this.stage, calls }))
  }
  async run<T>(current: () => boolean, operation: () => Promise<T>): Promise<T> {
    let open = true
    try {
      return await withWorkerOwnership(async (command, args, options) => {
        if (!this.clients.includes(basename(command)))
          return unmanagedWorkerProcess(command, args, options)
        if (!open || !current() || options.signal.aborted)
          throw new DeliveryRunnerError('native-owner-scope-closed')
        let call: NativeCall | undefined
        this.files.locked(() => {
          const calls = this.calls()
          if (calls.some((c) => c.status === 'unknown') || calls.length >= 1000)
            throw new DeliveryRunnerError('unresolved-native-owner-scope')
          const index = calls.length
          call = {
            invocation: contractDigest({
              stage: this.stage,
              index,
              command,
              args,
              input: contractDigest(options.input),
            }),
            command: basename(command),
            index,
            status: 'issued',
          }
          calls.push(call)
          this.write(calls)
        })
        if (!call) throw new DeliveryRunnerError('missing-native-call-registration')
        const selected = call,
          manager = new ManagedRunnerProcess(this.files, selected.invocation)
        try {
          const { input, ...native } = options
          const result = await manager.invoke(command, args, input, {
            ...native,
            current: () => open && current(),
          })
          this.files.locked(() => {
            const calls = this.calls(),
              record = calls[selected.index]
            if (!record || record.invocation !== selected.invocation)
              throw new DeliveryRunnerError('changed-native-call-registration')
            record.status = result.ownership.invocationState === 'unknown' ? 'unknown' : 'closed'
            this.write(calls)
          })
          return result
        } catch (error) {
          this.files.locked(() => {
            const calls = this.calls(),
              record = calls[selected.index]
            if (record?.invocation === selected.invocation) {
              record.status = 'unknown'
              this.write(calls)
            }
          })
          throw error
        }
      }, operation)
    } finally {
      open = false
    }
  }
  inspect() {
    const calls = this.calls(),
      observations = ManagedRunnerProcess.observeAll(
        this.files,
        calls.map((call) => call.invocation),
      )
    return calls.map((call, index) => {
      const observed = observations[index]
      if (!observed) throw new DeliveryRunnerError('native-scope-observation-unavailable')
      return { ...call, observed }
    })
  }
  requestCancellation() {
    for (const call of this.calls()) {
      const manager = new ManagedRunnerProcess(this.files, call.invocation)
      if (manager.observe().invocationState === 'unknown') manager.requestCancellation()
    }
  }
}
