// Observes the Claude Code reference client inside its macOS sandbox before admission (ADR-0203).
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { StoreFiles } from '../state/files.js'
import { assertExternal, canonicalPath, inside } from '../state/paths.js'
import { deliveryWorkerEnvironment } from './broker.js'
import { nativeDeliveryRecipe, REFERENCE_NATIVE_VERSIONS } from './native-adapters.js'
import type { NativeBoundaryHost, NativeProcessRunner } from './native-assignment-host.js'
import { NATIVE_BOUNDARY_PROGRAM } from './native-boundary-program.js'
import type { NativeDeliveryObservation } from './native-capabilities.js'
import {
  CLAUDE_CREDENTIAL_FILES,
  claudeInjectedConfig,
  claudeInjectedHome,
  claudeSandboxProfile,
  type NativeClaudeContainment,
} from './native-claude-sandbox.js'
import { nativeBoundaryKey } from './native-codex-boundary.js'
import type { NativeInjectedCredential } from './native-credentials.js'
import { nativeWorkspaceWitness, sealNativeGitControl } from './native-workspace.js'

type Input = Parameters<NativeBoundaryHost['observe']>[0]
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Observes the Claude Code reference client inside its macOS sandbox profile
 * before admission (ADR-0203). The probe runs the controller's own program
 * under the same profile the launch will use, so every file denial is the
 * operating system's, not the model's claim. No model is invoked.
 */
export class ClaudeBoundaryHost implements NativeBoundaryHost {
  constructor(
    readonly files: StoreFiles,
    readonly options: {
      path: string
      containment: NativeClaudeContainment
      workspace?: string
      output?: 'files' | 'inline-proposal'
      provenance: 'fixture' | 'host-observed'
      process: NativeProcessRunner
      current(): boolean
      /** Required exactly when the containment injects its credential (ADR-0209). */
      credential?: NativeInjectedCredential
      /** Defaults to the running controller; tests pass a fixed value. */
      platform?: NodeJS.Platform
      node?: string
    },
  ) {}

  private async call(
    input: Input,
    command: string,
    args: string[],
    body: string,
    directory: string,
    observe?: Parameters<NativeProcessRunner>[2]['observe'],
    signal = input.signal ?? new AbortController().signal,
    secret?: { variable: string; value: string },
  ) {
    const timeoutMs = Math.min(5000, Date.parse(input.assignment.deadline) - Date.now())
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || signal.aborted || !this.options.current())
      throw new Error('Native boundary control fenced; original attempt retained')
    const { containment } = this.options,
      env = deliveryWorkerEnvironment({
        home: join(directory, 'home'),
        path: this.options.path,
        temp: join(directory, 'tmp'),
        run: input.assignment.identity.run,
        attempt: input.assignment.identity.attempt,
      })
    env.USER = containment.user
    if (containment.credential === 'keychain') {
      env.HOME = containment.home
      env.CLAUDE_CONFIG_DIR = containment.store
    } else {
      env.HOME = claudeInjectedHome(directory)
      env.CLAUDE_CONFIG_DIR = claudeInjectedConfig(directory)
      // Only the call that needs it carries the value: the authentication check.
      if (secret) env[secret.variable] = secret.value
    }
    // The launch's own temporary directory, never the shared /tmp/claude-<uid>.
    env.CLAUDE_CODE_TMPDIR = join(directory, 'tmp')
    env.DISABLE_AUTOUPDATER = '1'
    const result = await this.options.process(command, args, {
      cwd: directory,
      input: body,
      timeoutMs,
      signal,
      env,
      ...(observe ? { observe } : {}),
    })
    if (result.ownership?.invocationState !== 'stopped')
      throw new Error('Native boundary control ownership unresolved; original attempt retained')
    if (!this.options.current() || input.signal?.aborted)
      throw new Error('Native boundary control changed; original attempt retained')
    return result
  }

  async observe(input: Input): Promise<NativeDeliveryObservation | undefined> {
    const { containment } = this.options
    if (
      (this.options.platform ?? process.platform) !== 'darwin' ||
      input.recipe.target !== 'claude' ||
      input.recipe.version !== REFERENCE_NATIVE_VERSIONS.claude
    )
      return undefined
    const selected = nativeDeliveryRecipe({
      target: 'claude',
      version: input.recipe.version,
      assignment: input.assignment,
      directory: input.recipe.cwd,
      model: input.model,
      containment,
      ...(this.options.workspace ? { workspace: this.options.workspace } : {}),
      ...(this.options.output ? { output: this.options.output } : {}),
    })
    if (
      !selected.available ||
      selected.recipe.command !== input.recipe.command ||
      selected.recipe.policy !== input.recipe.policy ||
      contractDigest(selected.recipe.args) !== contractDigest(input.recipe.args)
    )
      return undefined
    const directory = canonicalPath(input.recipe.cwd),
      prefix = this.files.path(
        `delivery/native/${input.assignment.identity.run}/${input.assignment.identity.attempt}`,
      )
    if (
      canonicalPath(containment.client) !== containment.client ||
      !inside(prefix, directory) ||
      directory === prefix ||
      !lstatSync(containment.client).isFile() ||
      // A credential comes from exactly one source: the signed-in Keychain or the injection.
      (containment.credential === 'injected') !== (this.options.credential !== undefined)
    )
      return undefined
    const store =
      containment.credential === 'keychain' ? canonicalPath(containment.store) : undefined
    if (containment.credential === 'keychain' && store) {
      assertExternal(store)
      if (
        store !== containment.store ||
        inside(this.files.root, store) ||
        inside(store, this.files.root) ||
        inside(directory, store) ||
        (this.options.workspace && inside(this.options.workspace, store)) ||
        !lstatSync(store).isDirectory() ||
        // The client must keep its credential in the Keychain, never beside its settings.
        readdirSync(store).some((name) => CLAUDE_CREDENTIAL_FILES.includes(name))
      )
        return undefined
    } else mkdirSync(claudeInjectedConfig(directory), { recursive: true, mode: 0o700 })
    const seal = this.options.workspace ? sealNativeGitControl(this.options.workspace) : () => true,
      workspace = this.options.workspace
        ? nativeWorkspaceWitness(this.options.workspace)
        : undefined
    if (this.options.workspace && !workspace) return undefined
    const control = randomUUID(),
      index = `delivery/native-boundary-index/${nativeBoundaryKey(input)}.txt`,
      root = `delivery/native-boundary-controls/${input.assignment.assignment}/${control}`,
      nonce = randomUUID(),
      relative = directory.slice(this.files.root.length + 1),
      read = join(directory, 'inputs', `.boundary-${nonce}.txt`),
      output = join(directory, 'outputs', `.boundary-${nonce}.txt`),
      privatePath = this.files.path(`${root}/private-witness.txt`),
      credentials = this.files.path(`${root}/credential-witness.txt`)
    this.files.locked(() => {
      if (existsSync(this.files.path(index)))
        throw new Error('Native boundary control already issued; inspect its original owner')
      this.files.atomic(index, `${input.assignment.assignment}/${control}\n`)
    })
    for (const name of ['inputs', 'outputs', 'tmp', 'home'])
      mkdirSync(join(directory, name), { recursive: true, mode: 0o700 })
    this.files.atomic(`${root}/private-witness.txt`, nonce)
    this.files.atomic(`${root}/credential-witness.txt`, nonce)
    this.files.atomic(`${relative}/inputs/.boundary-${nonce}.txt`, nonce)
    this.files.atomic(`${relative}/outputs/.boundary-${nonce}.txt`, nonce)
    const launch = input.recipe.args[1] ?? '',
      version = await this.call(
        input,
        containment.sandbox,
        ['-p', launch, containment.client, '--version'],
        '',
        directory,
      )
    if (
      version.status !== 'succeeded' ||
      version.stdout.trim() !== `${input.recipe.version} (Claude Code)`
    )
      return undefined
    // Same rules plus read access to the controller's Node runtime, so the
    // controller's program can run where the client will.
    const node = canonicalPath(this.options.node ?? process.execPath),
      probe = claudeSandboxProfile({
        containment,
        directory,
        output: this.options.output ?? 'files',
        ...(this.options.workspace ? { workspace: this.options.workspace } : {}),
        workspaceWrite: input.assignment.tools.workspace === 'write',
        probe: dirname(dirname(node)),
      }),
      program = [
        '-p',
        probe,
        node,
        '--openssl-config=/dev/null',
        '--input-type=module',
        '-e',
        NATIVE_BOUNDARY_PROGRAM,
      ],
      actual = await this.call(
        input,
        containment.sandbox,
        program,
        JSON.stringify({
          nonce,
          read,
          private: privatePath,
          credentials,
          workspace: workspace ?? read,
          output,
          port: 9,
        }),
        directory,
      )
    if (actual.status !== 'succeeded' || Buffer.byteLength(actual.stdout) > 4096 || !seal())
      return undefined
    let value: Record<string, unknown>
    try {
      value = JSON.parse(actual.stdout) as Record<string, unknown>
    } catch {
      return undefined
    }
    // The client needs its API, so network is not denied here; containment of
    // commands comes from restricted mode, which removes every command tool.
    if (
      Object.keys(value).sort().join(',') !==
        'credentialsDenied,networkDenied,nonce,outputWrite,privateDenied,read,workspaceWrite' ||
      value.nonce !== nonce ||
      value.read !== true ||
      value.privateDenied !== true ||
      value.credentialsDenied !== true ||
      value.workspaceWrite !==
        (input.assignment.tools.workspace === 'write' ? 'allowed' : 'denied') ||
      value.outputWrite !== (this.options.output === 'inline-proposal' ? 'denied' : 'allowed') ||
      !input.recipe.args.includes('--restricted')
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
        containment.sandbox,
        program,
        JSON.stringify({ mode: 'cancel', nonce }),
        directory,
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
    // Only the client opens its own credential; retain a hash of its status, not its output.
    // An injected credential is resolved for this one call. The client reports it
    // as consumed without validating it (2.1.319), so this proves the client reads
    // the injected variable, not that the account accepts it.
    const secret = this.options.credential ? await this.options.credential.resolve() : undefined
    if (secret && !secret.resolved) return undefined
    const status = await this.call(
      input,
      containment.sandbox,
      ['-p', launch, containment.client, 'auth', 'status'],
      '',
      directory,
      undefined,
      undefined,
      secret?.resolved ? { variable: secret.variable, value: secret.value } : undefined,
    )
    let authenticated = false
    try {
      const parsed = JSON.parse(status.stdout) as { loggedIn?: unknown; authMethod?: unknown }
      authenticated =
        status.status === 'succeeded' &&
        status.code === 0 &&
        parsed.loggedIn === true &&
        // An injected credential must be the one the client uses, not an ambient one.
        (!this.options.credential ||
          parsed.authMethod ===
            (this.options.credential.reference.kind === 'api-key' ? 'api_key' : 'oauth_token'))
    } catch {
      authenticated = false
    }
    const proof = {
      assignment: input.assignment.assignment,
      policy: input.recipe.policy,
      version: hash(version.stdout),
      profile: hash(launch),
      probe: hash(probe),
      observation: value,
      cancelled: { status: cancelled.status, ownership: cancelled.ownership },
      program: hash(NATIVE_BOUNDARY_PROGRAM),
      store: store ? hash(store) : null,
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
    this.files.atomic(`${root}/proof.json`, `${JSON.stringify(proof)}\n`)
    return {
      schema: 'wholeloop/delivery-native-observation@1',
      target: 'claude',
      version: input.recipe.version,
      role: input.assignment.identity.role,
      assignment: input.assignment.assignment,
      policy: input.recipe.policy,
      model: input.model,
      evidence: contractDigest(proof),
      provenance: this.options.provenance,
      authenticated,
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
  }
}
