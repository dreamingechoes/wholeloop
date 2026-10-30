import {
  type DockerCallOptions,
  DockerEnvironmentError,
  type DockerTransport,
} from './docker-command.js'

export interface EnvironmentProvisionControl {
  deadline: string
  signal: AbortSignal
  current(): boolean
  requireNewResource?: boolean
}

/** Parent bounds narrow provisioning; they never renew the resource's own limits. */
export class EnvironmentProvisionParent {
  private readonly control: Readonly<EnvironmentProvisionControl> | undefined
  readonly driver: DockerTransport
  readonly requireNewResource: boolean
  constructor(
    private readonly original: DockerTransport,
    control?: EnvironmentProvisionControl,
  ) {
    this.requireNewResource = control?.requireNewResource === true
    this.control =
      control &&
      Object.freeze({
        deadline: control.deadline,
        signal: control.signal,
        current: control.current.bind(control),
      })
    this.driver = control
      ? { provenance: original.provenance, call: (args, options) => this.call(args, options) }
      : original
  }
  check() {
    const control = this.control
    if (
      control &&
      (control.signal.aborted ||
        !Number.isFinite(Date.parse(control.deadline)) ||
        new Date(control.deadline).toISOString() !== control.deadline ||
        Date.now() >= Date.parse(control.deadline) ||
        !control.current())
    )
      throw new DockerEnvironmentError('environment-parent-not-current')
  }
  deadline(original: string) {
    return this.control
      ? new Date(Math.min(Date.parse(original), Date.parse(this.control.deadline))).toISOString()
      : original
  }
  private async call(inputArgs: string[], inputOptions: DockerCallOptions = {}) {
    const args = [...inputArgs],
      options = { ...inputOptions }
    this.check()
    const control = this.control
    if (!control) return this.original.call(args, options)
    const timeoutMs = Math.floor(
      Math.min(options.timeoutMs ?? 10000, Date.parse(control.deadline) - Date.now()),
    )
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || options.signal?.aborted)
      throw new DockerEnvironmentError('environment-parent-not-current')
    const abort = new AbortController(),
      cancel = () => abort.abort()
    control.signal.addEventListener('abort', cancel, { once: true })
    options.signal?.addEventListener('abort', cancel, { once: true })
    const watch = setInterval(() => {
      try {
        this.check()
      } catch {
        abort.abort()
      }
    }, 250)
    try {
      if (control.signal.aborted || options.signal?.aborted) abort.abort()
      this.check()
      if (abort.signal.aborted) throw new DockerEnvironmentError('environment-parent-not-current')
      const result = await this.original.call(args, {
        ...options,
        timeoutMs,
        signal: abort.signal,
      })
      this.check()
      if (abort.signal.aborted) throw new DockerEnvironmentError('environment-parent-not-current')
      return result
    } finally {
      clearInterval(watch)
      control.signal.removeEventListener('abort', cancel)
      options.signal?.removeEventListener('abort', cancel)
    }
  }
}
