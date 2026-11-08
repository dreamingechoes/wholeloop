// Observes the Codex reference client's containment before admission.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { StoreFiles } from '../state/files.js'
import { assertExternal, canonicalPath, inside } from '../state/paths.js'
import { deliveryWorkerEnvironment } from './broker.js'
import { readSourceFile, safeSourceText } from './input.js'
import { nativeDeliveryRecipe, REFERENCE_NATIVE_VERSIONS } from './native-adapters.js'
import type { NativeBoundaryHost, NativeProcessRunner } from './native-assignment-host.js'
import { NATIVE_BOUNDARY_PROGRAM } from './native-boundary-program.js'
import type { NativeDeliveryObservation } from './native-capabilities.js'
import type { NativeInjectedCredential } from './native-credentials.js'
import { nativeWorkspaceWitness, sealNativeGitControl } from './native-workspace.js'

type Input = Parameters<NativeBoundaryHost['observe']>[0]
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
/** Changed role/context/policy cannot buy another control within one admitted attempt. */
export const nativeBoundaryKey = (input: Input) =>
  contractDigest({
    run: input.assignment.identity.run,
    attempt: input.assignment.identity.attempt,
    generation: input.assignment.identity.generation,
    grant: input.assignment.grantDigest,
  })
interface ProbeResult {
  nonce: string
  read: boolean
  privateDenied: boolean
  credentialsDenied: boolean
  workspaceWrite: 'allowed' | 'denied' | 'unavailable'
  outputWrite: 'allowed' | 'denied' | 'unavailable'
  networkDenied: boolean
}

/** The fixed reference client must demonstrate its actual sandbox; a version or model claim alone grants nothing. */
export class CodexBoundaryHost implements NativeBoundaryHost {
  constructor(
    readonly files: StoreFiles,
    readonly options: {
      path: string
      /** The signed-in client home; absent exactly when a credential is injected (ADR-0209). */
      nativeStore?: string
      credential?: NativeInjectedCredential
      workspace?: string
      output?: 'files' | 'inline-proposal'
      provenance: 'fixture' | 'host-observed'
      process: NativeProcessRunner
      current(): boolean
    },
  ) {}

  private async call(
    input: Input,
    args: string[],
    body: string,
    home: string,
    credentials = false,
    observe?: Parameters<NativeProcessRunner>[2]['observe'],
    signal = input.signal ?? new AbortController().signal,
  ) {
    const timeoutMs = Math.min(5000, Date.parse(input.assignment.deadline) - Date.now())
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || signal.aborted || !this.options.current())
      throw new Error('Native boundary control fenced; original attempt retained')
    const result = await this.options.process('codex', ['--no-daemon', ...args], {
      cwd: input.recipe.cwd,
      input: body,
      timeoutMs,
      signal,
      env: {
        ...deliveryWorkerEnvironment({
          home,
          path: this.options.path,
          temp: home,
          run: input.assignment.identity.run,
          attempt: input.assignment.identity.attempt,
        }),
        // An injected credential leaves no signed-in home: every call uses its own disposable one.
        CODEX_HOME: credentials && this.options.nativeStore ? this.options.nativeStore : home,
        OPENSSL_CONF: '/dev/null',
      },
      ...(observe ? { observe } : {}),
    })
    if (result.ownership?.invocationState !== 'stopped')
      throw new Error('Native boundary control ownership unresolved; original attempt retained')
    if (!this.options.current() || input.signal?.aborted)
      throw new Error('Native boundary control changed; original attempt retained')
    return result
  }

  /** Runs no model and never queries an account; authentication remains false in this policy-only observation. */
  async probePolicy(input: Input): Promise<NativeDeliveryObservation | undefined> {
    if (input.recipe.target !== 'codex' || input.recipe.version !== REFERENCE_NATIVE_VERSIONS.codex)
      return undefined
    const selected = nativeDeliveryRecipe({
      target: 'codex',
      version: input.recipe.version,
      assignment: input.assignment,
      directory: input.recipe.cwd,
      model: input.model,
      ...(this.options.workspace ? { workspace: this.options.workspace } : {}),
      ...(this.options.output ? { output: this.options.output } : {}),
    })
    if (
      !selected.available ||
      selected.recipe.command !== input.recipe.command ||
      selected.recipe.policy !== input.recipe.policy ||
      contractDigest(selected.recipe.args) !== contractDigest(input.recipe.args) ||
      contractDigest([...selected.recipe.files]) !== contractDigest([...input.recipe.files])
    )
      return undefined
    const directory = canonicalPath(input.recipe.cwd),
      prefix = this.files.path(
        `delivery/native/${input.assignment.identity.run}/${input.assignment.identity.attempt}`,
      ),
      // Without a signed-in home the boundary program still proves that a
      // path outside the run is denied; the controller's own witness serves.
      credentials = this.options.nativeStore
        ? canonicalPath(this.options.nativeStore)
        : this.files.path('delivery/native-boundary-credential-witness')
    if ((this.options.nativeStore === undefined) === (this.options.credential === undefined))
      return undefined
    if (this.options.nativeStore) {
      assertExternal(credentials)
      safeSourceText(credentials, 4096)
    } else mkdirSync(credentials, { recursive: true, mode: 0o700 })
    if (
      !inside(prefix, directory) ||
      directory === prefix ||
      (this.options.nativeStore !== undefined && inside(this.files.root, credentials)) ||
      inside(directory, credentials) ||
      (this.options.workspace && inside(this.options.workspace, credentials)) ||
      !lstatSync(credentials).isDirectory()
    )
      return undefined
    const seal = this.options.workspace ? sealNativeGitControl(this.options.workspace) : () => true,
      workspace = this.options.workspace
        ? nativeWorkspaceWitness(this.options.workspace)
        : undefined
    if (this.options.workspace && !workspace) return undefined
    const control = randomUUID(),
      index = `delivery/native-boundary-index/${nativeBoundaryKey(input)}.txt`,
      root = `delivery/native-boundary-controls/${input.assignment.assignment}/${control}`,
      home = this.files.path(`${root}/home`),
      nonce = randomUUID(),
      read = join(directory, 'inputs', `.boundary-${nonce}.txt`),
      output = join(directory, 'outputs', `.boundary-${nonce}.txt`),
      privatePath = this.files.path(`${root}/private-witness.txt`)
    this.files.locked(() => {
      if (existsSync(this.files.path(index)))
        throw new Error('Native boundary control already issued; inspect its original owner')
      this.files.atomic(index, `${input.assignment.assignment}/${control}\n`)
    })
    mkdirSync(home, { recursive: true, mode: 0o700 })
    mkdirSync(join(directory, 'inputs'), { recursive: true, mode: 0o700 })
    mkdirSync(join(directory, 'outputs'), { recursive: true, mode: 0o700 })
    this.files.atomic(`${root}/private-witness.txt`, nonce)
    this.files.atomic(
      `${directory.slice(this.files.root.length + 1)}/inputs/.boundary-${nonce}.txt`,
      nonce,
    )
    this.files.atomic(
      `${directory.slice(this.files.root.length + 1)}/outputs/.boundary-${nonce}.txt`,
      nonce,
    )
    const version = await this.call(input, ['--version'], '', home)
    if (
      version.status !== 'succeeded' ||
      version.stdout.trim() !== `codex-cli ${input.recipe.version}`
    )
      return undefined
    const config = input.recipe.args.flatMap((arg, index, all) =>
        arg === '--config' ? ['--config', all[index + 1] ?? ''] : [],
      ),
      args = [
        '--ask-for-approval',
        'never',
        'sandbox',
        ...config,
        '-P',
        'wholeloop',
        '--',
        process.execPath,
        // The client deliberately drops inherited environment variables. Avoid
        // Node's optional system OpenSSL file without widening its read roots.
        '--openssl-config=/dev/null',
        '--input-type=module',
        '-e',
        NATIVE_BOUNDARY_PROGRAM,
      ],
      server = createServer((socket) => socket.destroy())
    const features = await this.call(input, [...config, 'features', 'list'], '', home),
      requested = config
        .filter((arg) => arg.startsWith('features.'))
        .map((arg) => arg.slice('features.'.length).split('=')[0] ?? ''),
      toggles = new Map(
        [...features.stdout.matchAll(/^([a-z0-9_]+)\s+.+?\s+(true|false)\s*$/gm)].map((match) => [
          match[1],
          match[2],
        ]),
      )
    if (features.status !== 'succeeded' || requested.some((name) => toggles.get(name) !== 'false'))
      return undefined
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') return undefined
      const actual = await this.call(
        input,
        args,
        JSON.stringify({
          nonce,
          read,
          private: privatePath,
          credentials,
          workspace: workspace ?? read,
          output,
          port: address.port,
        }),
        home,
      )
      if (actual.status !== 'succeeded' || Buffer.byteLength(actual.stdout) > 4096 || !seal())
        return undefined
      let value: ProbeResult
      try {
        value = JSON.parse(actual.stdout) as ProbeResult
      } catch {
        return undefined
      }
      if (
        Object.keys(value).sort().join(',') !==
          'credentialsDenied,networkDenied,nonce,outputWrite,privateDenied,read,workspaceWrite' ||
        value.nonce !== nonce ||
        value.read !== true ||
        value.privateDenied !== true ||
        value.credentialsDenied !== true ||
        value.networkDenied !== true ||
        value.workspaceWrite !==
          (input.assignment.tools.workspace === 'write' ? 'allowed' : 'denied') ||
        value.outputWrite !== (this.options.output === 'inline-proposal' ? 'denied' : 'allowed')
      )
        return undefined
      const abort = new AbortController(),
        cancel = () => abort.abort()
      input.signal?.addEventListener('abort', cancel, { once: true })
      let ready = false,
        text = ''
      let cancelled: Awaited<ReturnType<NativeProcessRunner>>
      try {
        cancelled = await this.call(
          input,
          args,
          JSON.stringify({ mode: 'cancel', nonce }),
          home,
          false,
          (stream, chunk) => {
            if (stream !== 'stdout' || text.length > 4096) return
            text += chunk.toString('utf8')
            if (text.includes(`${JSON.stringify({ ready: nonce })}\n`)) {
              ready = true
              abort.abort()
            }
          },
          abort.signal,
        )
      } finally {
        input.signal?.removeEventListener('abort', cancel)
      }
      if (!ready || cancelled.status !== 'cancelled' || !seal()) return undefined
      const proof = {
        assignment: input.assignment.assignment,
        policy: input.recipe.policy,
        version: hash(version.stdout),
        features: hash(features.stdout),
        observation: value,
        cancelled: { status: cancelled.status, ownership: cancelled.ownership },
        program: hash(NATIVE_BOUNDARY_PROGRAM),
      }
      this.files.atomic(`${root}/proof.json`, `${JSON.stringify(proof)}\n`)
      return {
        schema: 'wholeloop/delivery-native-observation@1',
        target: 'codex',
        version: input.recipe.version,
        role: input.assignment.identity.role,
        assignment: input.assignment.assignment,
        policy: input.recipe.policy,
        model: input.model,
        evidence: contractDigest(proof),
        provenance: this.options.provenance,
        authenticated: false,
        boundary: {
          contained: true,
          controllerStoreDenied: true,
          credentialsDenied: true,
          toolsRestricted: true,
          interactiveDisabled: true,
          cancellable: true,
          completeOutput: true,
          ownedOutputReader: true,
        },
        metering: { hardTokens: false, hardCurrency: false },
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }

  async observe(input: Input): Promise<NativeDeliveryObservation | undefined> {
    const observed = await this.probePolicy(input)
    if (!observed) return undefined
    const home = this.files.path(`delivery/native-boundary-auth/${randomUUID()}`)
    mkdirSync(home, { recursive: true, mode: 0o700 })
    // Only the trusted client opens its own credential store. Retain no auth
    // output, credential bytes or environment values in controller artifacts.
    const config = input.recipe.args.flatMap((arg, index, all) =>
        arg === '--config' ? ['--config', all[index + 1] ?? ''] : [],
      ),
      // `login status` ignores CODEX_API_KEY (0.166.0), which only `exec` reads, so
      // an injected key is checked by resolving it; its validity shows at launch.
      injected = this.options.credential ? await this.options.credential.resolve() : undefined,
      status = injected
        ? {
            status: injected.resolved ? ('succeeded' as const) : ('crashed' as const),
            code: injected.resolved ? 0 : 1,
            stdout: '',
            ownership: { invocationState: 'not-started' as const },
          }
        : await this.call(
            input,
            ['--ask-for-approval', 'never', ...config, 'login', 'status'],
            '',
            home,
            true,
          ),
      control = readSourceFile(
        this.files.root,
        `delivery/native-boundary-index/${nativeBoundaryKey(input)}.txt`,
        128,
      ).trim()
    if (!new RegExp(`^${input.assignment.assignment}/[a-f0-9-]{36}$`).test(control))
      throw new Error('Native boundary control binding unavailable')
    const proof = {
      policy: observed.evidence,
      assignment: observed.assignment,
      model: observed.model,
      store: this.options.nativeStore ? hash(canonicalPath(this.options.nativeStore)) : null,
      credential: this.options.credential
        ? contractDigest(this.options.credential.reference)
        : null,
      authentication: {
        status: status.status,
        code: status.code,
        stdout: hash(status.stdout),
        ownership: status.ownership,
      },
    }
    this.files.atomic(
      `delivery/native-boundary-controls/${control}/auth-proof.json`,
      `${JSON.stringify(proof)}\n`,
    )
    return {
      ...observed,
      evidence: contractDigest(proof),
      authenticated: status.status === 'succeeded' && status.code === 0,
    }
  }
}
