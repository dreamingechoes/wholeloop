import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { conformanceMatrix, conformanceMatrixMarkdown } from '../conformance/matrix.js'
import { conformancePage } from '../conformance/page.js'
import { prepareConformance } from '../conformance/prepare.js'
import { reportConformance, runConformance } from '../conformance/run.js'
import { storePath } from '../state/paths.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'

export async function conformanceCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (command === 'conformance matrix') {
    const file = positional[0]
    const docs = options['--docs']
    if (
      !file ||
      positional.length !== 1 ||
      (json && options['--markdown'] === true) ||
      (options['--write'] === true && typeof docs !== 'string') ||
      (typeof docs === 'string' &&
        (typeof options['--at'] !== 'string' || options['--markdown'] === true))
    )
      throw new CliError(
        'Use conformance matrix <results.json> [--at <UTC timestamp>] [--markdown | --json]; --docs <repository> requires explicit --at and supports optional --write',
      )
    let input: unknown
    try {
      const path = resolve(root, file)
      const stat = lstatSync(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error()
      const raw = readFileSync(path, 'utf8')
      if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error()
      input = JSON.parse(raw)
    } catch {
      throw new CliError('Provide one regular results JSON file of at most 1 MiB; contents omitted')
    }
    const matrix = conformanceMatrix(input, String(options['--at'] ?? new Date().toISOString()))
    const documentation =
      typeof docs === 'string'
        ? conformancePage(resolve(root, docs), matrix, options['--write'] === true)
        : undefined
    io.out(
      options['--markdown'] === true
        ? conformanceMatrixMarkdown(matrix)
        : JSON.stringify(
            { ...matrix, ...(documentation ? { documentation } : {}) },
            null,
            json ? undefined : 2,
          ),
    )
    return matrix.regressionCandidates.length || documentation?.status === 'stale' ? 4 : 0
  }
  const context = {
    store: typeof options['--store'] === 'string' ? resolve(root, options['--store']) : storePath(),
    canonical: bundledCanonical(),
    core: readFileSync(fileURLToPath(import.meta.url), 'utf8'),
    version: VERSION,
  }
  if (command === 'conformance prepare') {
    if (
      positional.length ||
      typeof options['--target'] !== 'string' ||
      typeof options['--pin'] !== 'string'
    )
      throw new CliError('Use conformance prepare --target <cli> --pin <exact-version>')
    io.out(
      JSON.stringify(
        prepareConformance(context, options['--target'], options['--pin']),
        null,
        json ? undefined : 2,
      ),
    )
    return 0
  }
  const id = positional[0]
  if (!id || positional.length !== 1)
    throw new CliError('Provide exactly one prepared conformance run ID')
  if (command === 'conformance report') {
    const report = reportConformance(context, id)
    io.out(JSON.stringify(report, null, json ? undefined : 2))
    return report.status === 'FAIL' ? 4 : report.status === 'UNRUN' ? 3 : 0
  }
  if ((options['--fixture'] === true) === (options['--live'] === true))
    throw new CliError(
      'Choose exactly one of --fixture or --live; live execution can use authenticated models',
    )
  const timeout = options['--timeout']
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  try {
    const report = await runConformance(
      context,
      id,
      options['--fixture'] === true ? 'fixture' : 'live',
      {
        signal: controller.signal,
        ...(typeof timeout === 'string' ? { timeoutMs: Number(timeout) } : {}),
      },
    )
    io.out(JSON.stringify(report, null, json ? undefined : 2))
    return report.status === 'FAIL' ? 4 : 0
  } finally {
    process.off('SIGINT', cancel)
    process.off('SIGTERM', cancel)
  }
}
