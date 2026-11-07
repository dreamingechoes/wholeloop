// POSIX process-group membership and termination for headless workers.
import { type ChildProcess, spawnSync } from 'node:child_process'

/** The consuming controller must actually belong to the registered live wrapper group. */
export function workerGroupMember(pid: number, group: number): boolean | undefined {
  if (![pid, group].every((value) => Number.isSafeInteger(value) && value > 0)) return undefined
  const result = spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], {
    encoding: 'utf8',
    timeout: 2000,
    maxBuffer: 4096,
  })
  if (result.error || result.status !== 0 || !/^\s*\d+\s*$/.test(result.stdout)) return undefined
  return Number(result.stdout.trim()) === group
}

/** One detached process group per worker keeps timeout cancellation scoped to its descendants. */
export function workerPlatform() {
  if (!['darwin', 'linux'].includes(process.platform))
    throw new Error('Headless workers currently require macOS or Linux')
  return { detached: true as const }
}
export function terminateWorker(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal)
  }
}
