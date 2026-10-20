import type { conformanceAcquisition } from '../src/conformance/acquisition.js'

type Plan = ReturnType<typeof conformanceAcquisition>
type Bytes = (url: string, limit: number, timeout?: number) => Promise<Buffer>
type Command = (
  executable: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
) => string
export const publicBytes: Bytes
export function resolveDownloads(
  platform: string,
  arch: string,
  pins: unknown,
  bytes?: Bytes,
  target?: string,
): Promise<unknown>
export function assertExternalDestination(destination: string): string
export function archiveInventory(
  archive: string,
  strip: number,
  command: Command,
  options: { cwd: string; env: Record<string, string> },
): string[]
export function installDownloads(
  plan: Plan,
  destination: string,
  dependencies?: { bytes?: Bytes; command?: Command },
): Promise<{
  schema: string
  status: string
  records: {
    cli: string
    channel: string
    version: string
    sha256: string
    expectedIntegrity: boolean
    status: string
  }[]
  directory: string
}>

export function provisionArguments(args: string[]): {
  destination: string | undefined
  target: string | undefined
}
