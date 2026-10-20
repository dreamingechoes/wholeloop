interface Binding {
  source: string
  run: string
  attempt: string
}
interface Receipt extends Binding {
  schema: string
  core: string
  cli: string
  status: string
  results: string
  observations: number
}
interface Observation {
  channel: string
  observedAt: string
  report: Record<string, unknown>
}
export function nightlyBinding(env?: NodeJS.ProcessEnv): Binding
export function verifyNightlyCore(expected: string, core?: string): void
export function nativeNightlyEnvironment(
  cli: string,
  home: string,
  key: string,
  model?: string,
): Record<string, string>
export function nightlyObservation(run: Observation): Observation
export function collectNightly(
  cli: string,
  nativeRoot: string,
  destination: string,
  dependencies?: {
    env?: NodeJS.ProcessEnv
    command?: (
      executable: string,
      args: string[],
      options: { env?: Record<string, string>; cwd?: string; draft?: boolean },
    ) => string
  },
): Receipt
export function aggregateNightly(
  input: string,
  destination: string,
  env?: NodeJS.ProcessEnv,
): {
  schema: string
  core: string
  results: string
  effects: string
  clients: { cli: string; status: string; observations: number }[]
}
