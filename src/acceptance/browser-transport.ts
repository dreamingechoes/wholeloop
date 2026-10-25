import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { contractDigest } from '../contracts/compatibility.js'
import {
  type DockerCli,
  type DockerProcessObservation,
  dockerCliEnvironment,
} from '../environment/docker-command.js'
import { DOCKER_INTERACTIVE_WRAPPER } from '../environment/interactive-wrapper.js'
import {
  type DockerOperationRegistration,
  EnvironmentOperations,
} from '../environment/operations.js'
import type { EnvironmentResource } from '../environment/runtime.js'
import { browserReferenceCommand } from './browser-reference.js'
import { AcceptanceError } from './contracts.js'
import type { DockerBehaviorRuntime } from './docker-runtime.js'

/** SDK framing over a registered native private pipe; the application cannot reach an MCP control socket. */
export class BrowserStdioTransport implements Transport {
  onclose?: NonNullable<Transport['onclose']>
  onerror?: NonNullable<Transport['onerror']>
  onmessage?: NonNullable<Transport['onmessage']>
  readonly operations: EnvironmentOperations
  private child?: ChildProcessWithoutNullStreams
  private registration?: DockerOperationRegistration
  private completion?: Promise<void>
  private closing?: Promise<void>
  private ended = false
  private failure = false
  private watch?: ReturnType<typeof setInterval>
  private timer?: ReturnType<typeof setTimeout>
  private readonly reader = new ReadBuffer({ maxBufferSize: 32 * 1024 * 1024 })
  private readonly hash = createHash('sha256')
  private output = 0
  private stderr = 0
  private process?: DockerProcessObservation
  private readonly args: string[]
  constructor(
    readonly runtime: DockerBehaviorRuntime,
    readonly resource: EnvironmentResource,
    readonly native: DockerCli,
    readonly origin: string,
  ) {
    if (!resource.id) throw new AcceptanceError('browser-container-unobserved')
    this.args = [
      'container',
      'exec',
      '--interactive',
      resource.id,
      ...browserReferenceCommand(origin),
    ]
    this.operations = new EnvironmentOperations(
      runtime.records.files,
      runtime.environment,
      native.provenance,
    )
  }
  private fail() {
    if (this.failure || this.ended) return
    this.failure = true
    try {
      if (this.registration) this.operations.cancel(this.registration)
    } catch {}
    this.onerror?.(new AcceptanceError('browser-transport-incomplete'))
  }
  async start() {
    if (this.child) throw new AcceptanceError('browser-transport-already-started')
    this.runtime.current()
    await this.runtime.daemon()
    const container = await this.runtime.resources.owned(this.resource)
    if (
      container.ExecIDs !== null &&
      (!Array.isArray(container.ExecIDs) || container.ExecIDs.length)
    )
      throw new AcceptanceError('browser-prior-daemon-exec-unknown')
    this.runtime.current()
    const registration = this.operations.begin(this.args, this.runtime.remaining(1800000))
    this.registration = registration
    const argv = ['--input-type=module', '-e', DOCKER_INTERACTIVE_WRAPPER]
    const child = spawn(process.execPath, argv, {
      cwd: homedir(),
      env: dockerCliEnvironment(this.native.env),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    child.stdin.on('error', () => this.fail())
    let finish!: () => void
    this.completion = new Promise<void>((resolve) => {
      finish = resolve
    })
    child.stdout.on('data', (bytes: Buffer) => {
      this.hash.update('stdout').update(bytes)
      this.output += bytes.length
      try {
        this.runtime.current()
        if (this.output > 64 * 1024 * 1024) throw new AcceptanceError('browser-protocol-byte-limit')
        this.reader.append(bytes)
        for (;;) {
          const message = this.reader.readMessage()
          if (!message) break
          this.onmessage?.(message)
        }
      } catch {
        this.fail()
      }
    })
    child.stderr.on('data', (bytes: Buffer) => {
      this.hash.update('stderr').update(bytes)
      this.stderr += bytes.length
      if (this.stderr > 1024 * 1024) this.fail()
    })
    child.once('error', () => this.fail())
    child.once('close', (code, signal) => {
      this.ended = true
      if (this.watch) clearInterval(this.watch)
      if (this.timer) clearTimeout(this.timer)
      this.reader.clear()
      if (this.process)
        this.process = { ...this.process, endedAt: new Date().toISOString(), code, signal }
      try {
        this.operations.close(registration, {
          status: this.failure ? 'cancelled' : code === 0 && !signal ? 'succeeded' : 'crashed',
          stdout: '',
          code,
          digest: this.hash.digest('hex'),
        })
      } catch {
        this.failure = true
      }
      finish()
      this.onclose?.()
    })
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('spawn', () => {
        try {
          this.runtime.current()
          if (!child.pid) throw new AcceptanceError('browser-invoker-unobserved')
          registration.started(child.pid)
          this.process = {
            pid: child.pid,
            argv: [process.execPath, ...argv],
            cwd: homedir(),
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            code: null,
            signal: null,
          }
          child.stdin.write(
            `${JSON.stringify({
              operation: registration.operation,
              nonce: registration.nonce,
              cancel: registration.cancel,
              outcome: registration.outcome,
              command: this.native.command,
              args: this.args,
              timeoutMs: this.runtime.remaining(1800000),
            })}\n`,
          )
          this.watch = setInterval(() => {
            try {
              this.runtime.current()
            } catch {
              this.fail()
            }
          }, 100)
          this.timer = setTimeout(() => this.fail(), this.runtime.remaining(1800000))
          resolve()
        } catch (error) {
          this.fail()
          reject(error)
        }
      })
    })
  }
  async send(message: JSONRPCMessage) {
    this.runtime.current()
    if (!this.child || this.ended || this.failure)
      throw new AcceptanceError('browser-transport-closed')
    const text = serializeMessage(message)
    if (Buffer.byteLength(text) > 65536) throw new AcceptanceError('browser-request-byte-limit')
    await new Promise<void>((resolve, reject) =>
      this.child?.stdin.write(text, (error) => (error ? reject(error) : resolve())),
    )
  }
  async close() {
    this.closing ??= this.finish()
    return this.closing
  }
  observation() {
    if (!this.ended || !this.process || !this.registration)
      throw new AcceptanceError('browser-invoker-unobserved')
    return { operation: this.registration.operation, process: structuredClone(this.process) }
  }
  private async finish() {
    if (!this.child || !this.registration || !this.completion) return
    this.child.stdin.end()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.completion,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => {
              this.fail()
              reject(new AcceptanceError('browser-invoker-unresolved'))
            },
            Math.min(4000, this.runtime.remaining(4000)),
          )
        }),
      ])
      if (
        this.failure ||
        !this.child.pid ||
        this.operations.completion(this.args, this.child.pid)?.code !== 0
      )
        throw new AcceptanceError('browser-invoker-unresolved')
      this.runtime.current()
      const observed = await this.runtime.resources.owned(this.resource)
      if (
        observed.ExecIDs !== null &&
        (!Array.isArray(observed.ExecIDs) || observed.ExecIDs.length)
      )
        throw new AcceptanceError('browser-daemon-exec-unresolved')
      this.operations.releaseExec(
        this.registration,
        contractDigest({
          container: observed,
          environment: this.runtime.records.get(this.runtime.environment).digest,
        }),
      )
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}
