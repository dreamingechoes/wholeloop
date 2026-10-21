/** Bounded same-deployment JSON transport shared by explicit dashboard hosts. */
export async function withDashboardHttp<T>(
  config: { baseUrl: string; tokenEnv: string },
  options: {
    secret: (name: string) => string | undefined | Promise<string | undefined>
    fetch?: typeof globalThis.fetch
    signal?: AbortSignal
  },
  action: (request: (path: string, body?: unknown) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  options.signal?.throwIfAborted()
  const credential = await options.secret(config.tokenEnv)
  if (
    !credential ||
    credential.length > 8192 ||
    credential.trim() !== credential ||
    /[\r\n]/.test(credential)
  )
    throw new Error('Missing or invalid host credential; contents omitted')
  options.signal?.throwIfAborted()
  const controller = new AbortController(),
    timeout = AbortSignal.timeout(10000)
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  timeout.addEventListener('abort', abort, { once: true })
  try {
    return await action(async (path, body) => {
      const url = new URL(path, config.baseUrl)
      if (!url.href.startsWith(config.baseUrl) || url.search || url.hash) throw new Error()
      const content = body === undefined ? undefined : JSON.stringify(body)
      if (content !== undefined && Buffer.byteLength(content) > 1024 * 1024) throw new Error()
      controller.signal.throwIfAborted()
      const response = await (options.fetch ?? globalThis.fetch)(url.href, {
        method: content === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${credential}`,
          Accept: 'application/json',
          ...(content === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(content === undefined ? {} : { body: content }),
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
      })
      if (
        !(content === undefined ? [200] : [200, 201]).includes(response.status) ||
        response.redirected ||
        !response.body ||
        !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')
      ) {
        await response.body?.cancel()
        throw new Error()
      }
      const chunks: Uint8Array[] = []
      let bytes = 0
      for await (const chunk of response.body) {
        bytes += chunk.length
        if (bytes > 1024 * 1024) throw new Error()
        chunks.push(chunk)
      }
      controller.signal.throwIfAborted()
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    })
  } finally {
    options.signal?.removeEventListener('abort', abort)
    timeout.removeEventListener('abort', abort)
  }
}
