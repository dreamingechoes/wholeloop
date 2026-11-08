// Which native checks exist per client, which roadmap criteria each one feeds and what it costs,
// so a maintainer can run every low-quota check for one installed client with one command.

export const CLIENTS = {
  claude: { binary: 'claude', tier: 'A' },
  codex: { binary: 'codex', tier: 'A' },
  opencode: { binary: 'opencode', tier: 'A' },
  copilot: { binary: 'copilot', tier: 'A' },
  gemini: { binary: 'gemini', tier: 'B' },
  antigravity: { binary: 'agy', tier: 'B' },
  cursor: { binary: 'agent', tier: 'B' },
} as const
export type Client = keyof typeof CLIENTS

export type ProbeId = 'version' | 'readonly' | 'framing'
export interface ProbePlan {
  id: ProbeId
  tasks: string[]
  cost: 'none' | 'one short turn' | 'one framing scenario'
  summary: string
}

// The criteria a passing probe can feed. A probe never closes a task alone: the receipt is
// evidence for the maintainer to review, and each task keeps its other open criteria.
const readonlyTasks: Record<Client, string[]> = {
  claude: ['P0-03'],
  codex: ['P0-03', 'P1-11'],
  opencode: ['P0-03', 'P1-11'],
  copilot: ['P0-03', 'P1-11'],
  gemini: ['P5-01'],
  antigravity: ['P5-01'],
  cursor: ['P5-02'],
}
const framingTasks: Record<Client, string[]> = {
  claude: ['P1-14'],
  codex: ['P1-14'],
  opencode: ['P1-14'],
  copilot: ['P1-14'],
  gemini: ['P5-01'],
  antigravity: ['P5-01'],
  cursor: ['P5-02'],
}

export function probePlan(client: Client, selected?: readonly ProbeId[]): ProbePlan[] {
  const all: ProbePlan[] = [
    {
      id: 'version',
      tasks: ['P1-13'],
      cost: 'none',
      summary: 'Observe the exact client version the way wl doctor does; no model is called.',
    },
    {
      id: 'readonly',
      tasks: readonlyTasks[client],
      cost: 'one short turn',
      summary:
        "Launch the client's read-only headless recipe in a disposable repository and ask it to write; the workspace must stay unchanged.",
    },
    {
      id: 'framing',
      tasks: framingTasks[client],
      cost: 'one framing scenario',
      summary:
        'Prepare and run the standalone framing conformance scenario live, then keep its report and redacted diagnostics.',
    },
  ]
  // The version always runs: every other probe is bound to the version it observed.
  return all.filter((probe) => probe.id === 'version' || !selected || selected.includes(probe.id))
}

export interface Arguments {
  client: Client
  live: boolean
  probes?: ProbeId[]
  evidence?: string
  timeoutSeconds: number
}
const usage =
  'Usage: npm run native:check -- <claude|codex|opencode|copilot|gemini|antigravity|cursor> [--live] [--probe readonly,framing] [--evidence <dir>] [--timeout <seconds>]'

export function parseArguments(argv: readonly string[]): Arguments {
  const [client, ...rest] = argv
  if (!client || !(client in CLIENTS)) throw new Error(usage)
  const parsed: Arguments = { client: client as Client, live: false, timeoutSeconds: 240 }
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (flag === '--live') parsed.live = true
    else if (flag === '--probe' && value) {
      const ids = value.split(',')
      if (ids.some((id) => !['readonly', 'framing'].includes(id))) throw new Error(usage)
      parsed.probes = ids as ProbeId[]
      index++
    } else if (flag === '--evidence' && value) {
      parsed.evidence = value
      index++
    } else if (flag === '--timeout' && value && /^\d+$/.test(value)) {
      parsed.timeoutSeconds = Number(value)
      if (parsed.timeoutSeconds < 10 || parsed.timeoutSeconds > 3600) throw new Error(usage)
      index++
    } else throw new Error(usage)
  }
  return parsed
}
