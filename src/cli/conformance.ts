// `wl conformance`: prepares, runs, collects and reports native client conformance.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { conformanceAcquisition } from '../conformance/acquisition.js'
import { collectConformance } from '../conformance/collection.js'
import { conformanceDiagnostics } from '../conformance/diagnostics.js'
import { conformanceIssues } from '../conformance/issues.js'
import { conformanceMatrix, conformanceMatrixMarkdown } from '../conformance/matrix.js'
import { conformancePage } from '../conformance/page.js'
import { prepareConformance } from '../conformance/prepare.js'
import { reportConformance, runConformance } from '../conformance/run.js'
import { readRegularText } from '../fs/regular-file.js'
import { storePath } from '../state/paths.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
import { emitCommand } from './presentation.js'

export async function conformanceCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (command === 'conformance acquisition') {
    if (positional.length !== 1) throw new CliError('Provide one downloads JSON file')
    let input: unknown
    try {
      const text = readRegularText(resolve(root, positional[0] ?? ''), 65536)
      if (text === undefined) throw new Error()
      input = JSON.parse(text)
    } catch {
      throw new CliError(
        'Provide a regular downloads JSON file of at most 64 KiB; contents omitted',
      )
    }
    emitCommand(command, conformanceAcquisition(input), io, json)
    return 0
  }
  if (command === 'conformance matrix' || command === 'conformance issues') {
    const file = positional[0]
    const docs = options['--docs']
    if (command === 'conformance issues' && typeof options['--at'] !== 'string')
      throw new CliError('Use conformance issues <results.json> --at <UTC timestamp> [--json]')
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
      const raw = readRegularText(resolve(root, file), 1024 * 1024)
      if (raw === undefined) throw new Error()
      input = JSON.parse(raw)
    } catch {
      throw new CliError('Provide one regular results JSON file of at most 1 MiB; contents omitted')
    }
    const asOf = String(options['--at'] ?? new Date().toISOString())
    if (command === 'conformance issues') {
      const result = conformanceIssues(input, asOf)
      emitCommand(command, result, io, json)
      return result.issues.length ? 4 : 0
    }
    const matrix = conformanceMatrix(input, asOf)
    const documentation =
      typeof docs === 'string'
        ? conformancePage(resolve(root, docs), matrix, options['--write'] === true)
        : undefined
    io.out(
      options['--markdown'] === true || !json
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
  if (command === 'conformance collect') {
    const file = positional[0]
    if (
      !file ||
      positional.length !== 1 ||
      (options['--fixture'] === true) === (options['--live'] === true)
    )
      throw new CliError(
        'Use conformance collect <plan.json> (--fixture | --live) [--bin-root <directory>]',
      )
    let plan: unknown
    try {
      const raw = readRegularText(resolve(root, file), 65536)
      if (raw === undefined) throw new Error()
      plan = JSON.parse(raw)
    } catch {
      throw new CliError(
        'Use one regular collection plan JSON file of at most 64 KiB; contents omitted',
      )
    }
    const controller = new AbortController()
    const cancel = () => controller.abort()
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    try {
      const result = await collectConformance(
        context,
        plan,
        options['--fixture'] === true ? 'fixture' : 'live',
        {
          signal: controller.signal,
          ...(typeof options['--bin-root'] === 'string'
            ? { binRoot: resolve(root, options['--bin-root']) }
            : {}),
          ...(typeof options['--timeout'] === 'string'
            ? { timeoutMs: Number(options['--timeout']) }
            : {}),
        },
      )
      emitCommand(command, result, io, json)
      return result.status === 'cancelled'
        ? 3
        : result.runs.some((run) => run.report.status === 'FAIL')
          ? 4
          : 0
    } finally {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
  }
  if (command === 'conformance prepare') {
    if (
      positional.length ||
      typeof options['--target'] !== 'string' ||
      typeof options['--pin'] !== 'string'
    )
      throw new CliError('Use conformance prepare --target <cli> --pin <exact-version>')
    emitCommand(
      command,
      prepareConformance(context, options['--target'], options['--pin']),
      io,
      json,
    )
    return 0
  }
  const id = positional[0]
  if (!id || positional.length !== 1)
    throw new CliError('Provide exactly one prepared conformance run ID')
  if (command === 'conformance diagnose') {
    emitCommand(command, conformanceDiagnostics(context, id), io, json)
    return 0
  }
  if (command === 'conformance report') {
    const report = reportConformance(context, id)
    emitCommand(command, report, io, json)
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
    emitCommand(command, report, io, json)
    return report.status === 'FAIL' ? 4 : 0
  } finally {
    process.off('SIGINT', cancel)
    process.off('SIGTERM', cancel)
  }
}
