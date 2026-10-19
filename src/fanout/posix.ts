import type { ChildProcess } from 'node:child_process'

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
