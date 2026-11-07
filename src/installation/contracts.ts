// Installation receipts, owned files and the seven targets they cover.
import { artifactDigest } from '../adapters/generate.js'
import type { InstallContext, InstalledFile, InstallPlan } from './plan.js'

// Recovery can retain current, previous and replacement catalogs together for all seven clients.
export const INSTALL_RECEIPT_BYTES = 4 * 1024 * 1024

export interface InstallationResult {
  schema: 'wholeloop/install@1' | 'wholeloop/uninstall@1'
  scope: 'user' | 'project'
  targets: readonly string[]
  receipt: string
  conformance: 'unverified'
  authenticated: false
  status: 'installed' | 'uninstalled' | 'already-correct' | 'already-absent' | 'planned'
  artifacts: string[]
  files?: string[]
  remove?: string[]
  backup?: string
  activation?: {
    native: 'restart-and-verify'
    gitHooks: 'per-repository-required'
    command: string[]
  }
  removal?: {
    native: 'restart-and-verify-removal'
    gitHooks: 'managed-separately'
    command: string[]
  }
}
export const TARGETS = [
  'claude',
  'codex',
  'opencode',
  'copilot',
  'gemini',
  'antigravity',
  'cursor',
] as const
export interface OwnedFile {
  path: string
  sha256: string
  mode: 0o644 | 0o755
  component: string
}
export interface Component {
  target: string
  artifact: string
  files: OwnedFile[]
  source: string
  core: string
  version: string
  locations: InstallPlan['locations']
}
export interface Pending {
  kind: 'install' | 'uninstall'
  targets: string[]
  before: Component[]
  after: Component[]
  backup: string
}
export interface Receipt {
  schema: 'wholeloop/install-receipt@1'
  identity: string
  scope: 'user' | 'project'
  components: Component[]
  directories: string[]
  pending?: Pending
}
export interface InstallInput {
  context: InstallContext
  targets: readonly string[]
  canonical: ReadonlyMap<string, string>
  core: string
  version: string
  dryRun?: boolean
}
export const owned = (file: InstalledFile): OwnedFile => ({
  path: file.path,
  mode: file.mode,
  sha256: artifactDigest(file.content),
  component: file.component,
})
export const metadata = (plan: InstallPlan): Component => ({
  target: plan.target,
  artifact: plan.artifact,
  files: plan.files.map(owned),
  source: plan.source,
  core: plan.core,
  version: plan.version,
  locations: plan.locations,
})
