export interface Io {
  out: (text: string) => void
  err: (text: string) => void
}

export const EXIT = {
  ok: 0,
  unexpected: 1,
  shape: 4,
} as const
