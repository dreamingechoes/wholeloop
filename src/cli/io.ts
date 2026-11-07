// Output streams and the exit codes every command returns.
export interface Io {
  out: (text: string) => void
  err: (text: string) => void
  flush?: (signal?: AbortSignal) => Promise<void>
  cancelOutput?: () => void
}

export const EXIT = {
  ok: 0,
  unexpected: 1,
  input: 2,
  precondition: 3,
  shape: 4,
} as const
