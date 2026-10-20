import { join } from 'node:path'
import { versionProbe } from '../diagnostics/doctor.js'
import { workerProcess } from '../fanout/process.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { StateStore } from '../state/store.js'
import type { ConformanceContext } from './contracts.js'
import { fixtureWorker } from './fixture.js'
import { judgeConformance } from './judge.js'
import { readConformance, runFiles } from './prepare.js'
import { conformanceEnvironment, conformanceInput, conformanceRecipe } from './recipes.js'
import { conformanceScenario } from './scenario.js'

export async function runConformance(
  context: ConformanceContext,
  id: string,
  mode: 'fixture' | 'live',
  options: { timeoutMs?: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {},
) {
  if (!['fixture', 'live'].includes(mode))
    throw new Error('Choose explicit fixture or live conformance execution')
  const timeoutMs = options.timeoutMs ?? 180_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600_000)
    throw new Error('Conformance timeout must be 100–600000 milliseconds')
  const files = runFiles(context, id)
  // Claim synchronously, then release before awaiting the worker; interrupted runs cannot be resumed or relabelled.
  const run = files.locked(() => {
    const run = readConformance(context, id)
    if (run.phase !== 'prepared')
      throw new Error(
        'Conformance run already claimed; inspect its report and prepare a fresh fixture',
      )
    if (new StateStore(run.state).events().length)
      throw new Error('Conformance fixture already contains journal evidence; prepare a fresh run')
    run.phase = 'running'
    run.mode = mode
    files.atomic('run.json', `${JSON.stringify(run)}\n`)
    return run
  })
  const { scenario } = conformanceScenario(context.canonical)
  const env = conformanceEnvironment(run, options.env)
  try {
    if (workspaceSnapshot(run.root).digest !== run.baseline) run.problem = 'workspace-changed'
    else if (mode === 'live') {
      const probe = versionProbe(conformanceRecipe(run).command, env, run.root)
      if (probe.status !== 'observed' || !probe.version) run.problem = 'version-unobserved'
      else if (probe.version !== run.pin) run.problem = 'version-mismatch'
      else {
        const recipe = conformanceRecipe(run)
        const result = await workerProcess(recipe.command, recipe.args, {
          cwd: recipe.cwd,
          input: conformanceInput(run, scenario),
          env,
          timeoutMs,
          signal: options.signal ?? new AbortController().signal,
        })
        run.process = {
          status: result.status,
          code: result.code,
          signal: result.signal,
          version: probe.version,
        }
      }
    } else {
      files.atomic('fixture.mjs', fixtureWorker)
      const result = await workerProcess(process.execPath, [files.path('fixture.mjs')], {
        cwd: run.root,
        input: JSON.stringify({ run, scenario }),
        env: { ...env, HOME: run.home, USERPROFILE: run.home },
        timeoutMs,
        signal: options.signal ?? new AbortController().signal,
      })
      run.process = { status: result.status, code: result.code, signal: result.signal }
    }
  } catch {
    run.problem = 'process-failed'
  }
  run.phase = 'finished'
  files.locked(() => files.atomic('run.json', `${JSON.stringify(run)}\n`))
  return reportConformance(context, id)
}

export function reportConformance(context: ConformanceContext, id: string) {
  const run = readConformance(context, id)
  const { scenario } = conformanceScenario(context.canonical)
  return { ...judgeConformance(run, scenario), journal: join(run.state, 'journal') }
}
