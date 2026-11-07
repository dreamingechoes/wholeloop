// The fixed Docker host for browser cases, talking only to the controller-owned MCP service.
import { createHash } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { type BehaviorObservation, observeAssertion } from './assertions.js'
import { BrowserMcpSession } from './browser-client.js'
import { type BrowserInput, browserInput, ownedBrowserUrl } from './browser-input.js'
import { browserPage, browserPng, browserTabs, browserTarget } from './browser-observation.js'
import {
  BROWSER_KEEPALIVE,
  BROWSER_PROBE_PORT,
  BROWSER_REFERENCE,
  BROWSER_REFERENCE_IMAGES,
} from './browser-reference.js'
import { BrowserStdioTransport } from './browser-transport.js'
import { type AcceptanceCase, AcceptanceError } from './contracts.js'
import { type CollectedDockerObservation, DockerObservedHost } from './docker-effect.js'
import type { DockerBehaviorRuntime } from './docker-runtime.js'
import { observeHttp } from './http.js'
import type { AcceptanceHost, DeliveryAcceptance } from './store.js'

export async function browserBoundary(runtime: DockerBehaviorRuntime, input: BrowserInput) {
  const { service: browser, resource } = runtime.service(input.browser.service)
  runtime.service(input.service)
  const internal = `http://${input.service}:${input.port}`
  if (
    runtime.recipe.network.runtime !== 'internal' ||
    browser.image !== BROWSER_REFERENCE_IMAGES[runtime.recipe.backend.architecture] ||
    browser.mounts.length ||
    browser.secrets.length ||
    browser.start.cwd !== '/tmp' ||
    browser.ports.length !== 1 ||
    browser.ports[0]?.container !== BROWSER_PROBE_PORT ||
    browser.ports[0]?.publish !== 'none' ||
    browser.readiness.kind !== 'tcp' ||
    browser.readiness.port !== BROWSER_PROBE_PORT ||
    !browser.after.includes(input.service) ||
    contractDigest(browser.start.argv) !== contractDigest(['node', '-e', BROWSER_KEEPALIVE]) ||
    input.browser.tools !== BROWSER_REFERENCE.digest
  )
    throw new AcceptanceError('browser-boundary-unavailable')
  await runtime.resources.owned(resource)
  await runtime.origin(input.service, input.port)
  return { internal, resource }
}

/** Browser RPCs come only from the exact controller-owned immutable MCP service. */
export class DockerBrowserHost extends DockerObservedHost {
  readonly id = 'docker-browser-mcp'
  constructor(
    acceptance: DeliveryAcceptance,
    digest: string,
    environment: string,
    caseId: string,
    driver: DockerTransport = new DockerCli(),
  ) {
    super(acceptance, digest, environment, caseId, driver)
    browserInput(this.test)
  }
  protected async observe(
    test: AcceptanceCase,
    context: Parameters<AcceptanceHost['execute']>[1],
    runtime: DockerBehaviorRuntime,
  ): Promise<CollectedDockerObservation> {
    const input = browserInput(test)
    const bound = await browserBoundary(runtime, input)
    const texts = input.grounding.map((ground) => {
      const file = runtime.recipe.files.find(
        (f) => f.id === ground.file && f.sha256 === ground.sha256,
      )
      if (!file) throw new AcceptanceError('browser-grounding-unavailable')
      const text = readSourceFile(
        runtime.records.files.root,
        `delivery/environment-inputs/${file.sha256}.txt`,
        1024 * 1024,
      )
      if (sourceHash(text) !== file.sha256) throw new AcceptanceError('browser-grounding-changed')
      return text
    })
    for (const step of input.steps)
      if (step.target && !texts.some((text) => text.includes(step.target?.name ?? '')))
        throw new AcceptanceError('browser-target-not-grounded')
    const native = this.driver instanceof DockerCli ? this.driver : this.driver.interactive?.native
    if (!(native instanceof DockerCli) || native.provenance !== this.driver.provenance)
      throw new AcceptanceError('browser-native-transport-unavailable')
    const transport = new BrowserStdioTransport(
      runtime,
      bound.resource,
      native,
      bound.internal,
      this.driver.interactive,
    )
    const session = new BrowserMcpSession(
      transport,
      context.signal,
      context.deadline,
      () => runtime.current(),
      runtime.recipe.limits.outputBytes,
    )
    const checks: Record<string, boolean> = {}
    const actions: {
      id: string
      kind: string
      url: string
      evidence: string
      target?: { role: string; name: string; ref: string }
    }[] = []
    const screenshots: {
      label: string
      sha256: string
      bytes: number
      width: number
      height: number
    }[] = []
    const captures: NonNullable<CollectedDockerObservation['captures']> = []
    let expected = ownedBrowserUrl(bound.internal, '/'),
      opened = false
    const snapshot = async () => {
      const observed = await session.call('browser_snapshot', {})
      if (observed.error) throw new AcceptanceError('browser-snapshot-unavailable')
      const page = browserPage(observed.text, bound.internal)
      const tabs = await session.call('browser_tabs', { action: 'list' })
      if (
        tabs.error ||
        browserTabs(tabs.text, bound.internal) !== page.url ||
        page.url !== expected
      )
        throw new AcceptanceError('browser-url-changed-or-stale')
      return { ...page, evidence: contractDigest({ snapshot: observed.digest, tabs: tabs.digest }) }
    }
    try {
      await session.connect(input.browser.tools)
      for (const step of input.steps) {
        runtime.current()
        let target: { role: string; name: string; ref: string } | undefined
        let evidence = ''
        if (opened) {
          const before = await snapshot()
          if (step.target)
            target = { ...step.target, ref: browserTarget(before.snapshot, step.target) }
        }
        if (step.kind === 'navigate') {
          expected = ownedBrowserUrl(bound.internal, step.path ?? '')
          const result = await session.call('browser_navigate', { url: expected })
          if (result.error) throw new AcceptanceError('browser-navigation-incomplete')
          opened = true
          evidence = result.digest
        } else if (step.kind === 'fresh') {
          const closed = await session.call('browser_close', {})
          if (closed.error) throw new AcceptanceError('browser-close-unobserved')
          const navigated = await session.call('browser_navigate', { url: expected })
          if (navigated.error) throw new AcceptanceError('browser-navigation-incomplete')
          evidence = contractDigest({ closed: closed.digest, navigated: navigated.digest })
        } else if (step.kind === 'reload') {
          const result = await session.call('browser_navigate', { url: expected })
          if (result.error) throw new AcceptanceError('browser-navigation-incomplete')
          evidence = result.digest
        } else if (step.kind === 'restart') {
          await runtime.restart(input.service)
          await runtime.origin(input.service, input.port)
          evidence = runtime.records.get(runtime.environment).digest
        } else if (step.kind === 'fill' || step.kind === 'click') {
          if (!target) throw new AcceptanceError('browser-target-unobserved')
          const result = await session.call(
            step.kind === 'fill' ? 'browser_type' : 'browser_click',
            {
              target: target.ref,
              element: target.name,
              ...(step.kind === 'fill' ? { text: step.text ?? '' } : {}),
            },
          )
          if (result.error) throw new AcceptanceError('browser-action-incomplete')
          evidence = result.digest
        } else if (step.kind === 'press') {
          const result = await session.call('browser_press_key', { key: step.key ?? '' })
          if (result.error) throw new AcceptanceError('browser-action-incomplete')
          evidence = result.digest
        } else if (step.kind === 'check') {
          const result = await session.call(
            'browser_wait_for',
            step.mode === 'absent' ? { textGone: step.text } : { text: step.text },
          )
          // A native timeout is an observed failed assertion; never invert it into an absence or a pass.
          checks[step.assertion ?? ''] =
            !result.error && result.text.includes(`### Result\nWaited for ${step.text}`)
          evidence = result.digest
        } else if (step.kind === 'capture') {
          const result = await session.call('browser_take_screenshot', {
            type: 'png',
            scale: 'css',
          })
          const image = result.images[0]
          if (result.error || result.images.length !== 1 || !image)
            throw new AcceptanceError('browser-capture-unavailable')
          const png = browserPng(image.data, image.mimeType)
          if (
            captures.length >= 4 ||
            captures.reduce((n, c) => n + c.bytes.length, 0) + png.bytes.length > 20 * 1024 * 1024
          )
            throw new AcceptanceError('browser-case-capture-limit')
          const label = step.label ?? step.id
          captures.push({ label, bytes: png.bytes, mediaType: 'image/png' })
          screenshots.push({
            label,
            sha256: createHash('sha256').update(png.bytes).digest('hex'),
            bytes: png.bytes.length,
            width: png.width,
            height: png.height,
          })
          evidence = result.digest
        }
        if (step.expectPath !== undefined)
          expected = ownedBrowserUrl(bound.internal, step.expectPath)
        const after = await snapshot()
        actions.push({
          id: step.id,
          kind: step.kind,
          url: after.url,
          evidence: contractDigest({ operation: evidence, observed: after.evidence }),
          ...(target ? { target } : {}),
        })
      }
      const backend: BehaviorObservation = { requests: [] }
      if (input.backend) {
        const origin = await runtime.origin(input.service, input.port)
        backend.requests.push(
          await observeHttp(
            origin,
            { id: 'backend', kind: 'request', method: 'GET', path: input.backend.path },
            context.signal,
            runtime.recipe.limits.outputBytes,
          ),
        )
      }
      const state = { checks }
      const assertions = test.assertions.map((assertion) => {
        const result =
          assertion.subject === 'state'
            ? observeAssertion(
                { ...assertion, subject: 'json' },
                {
                  requests: [
                    {
                      id: 'ui',
                      status: 200,
                      headers: {},
                      text: JSON.stringify(state),
                      json: state,
                    },
                  ],
                },
              )
            : observeAssertion(assertion, backend)
        return { id: result.id, status: result.status }
      })
      const closed = await session.call('browser_close', {})
      if (closed.error) throw new AcceptanceError('browser-close-unobserved')
      await session.close()
      const native = session.observation()
      return {
        execution: {
          operation: native.operation,
          applicationPid: 'not-observed',
          applicationSignal: 'not-observed',
        },
        process: {
          argv: native.process.argv,
          cwd: native.process.cwd,
          pid: native.process.pid,
          startedAt: native.process.startedAt,
          endedAt: native.process.endedAt,
          ...(native.process.code !== null ? { code: native.process.code } : {}),
          ...(native.process.signal ? { signal: native.process.signal } : {}),
        },
        observation: {
          reference: BROWSER_REFERENCE.id,
          server: BROWSER_REFERENCE.server,
          tools: BROWSER_REFERENCE.digest,
          origin: bound.internal,
          checks,
          actions,
          screenshots,
          backend: backend.requests,
          closed: closed.digest,
        },
        assertions,
        captures,
      }
    } finally {
      await session.close()
    }
  }
}
