export interface AdapterCapabilities {
  conformance: 'unverified'
  skills: 'rendered'
  agents: 'rendered'
  hooks: 'native-and-git-fallback' | 'git-fallback'
  readOnly:
    | 'tool-allowlist-and-plan-mode'
    | 'inherited-parent-and-checked-headless'
    | 'deny-shell-and-edit'
    | 'read-tool-allowlist'
    | 'native-readonly'
  engines: readonly ('headless' | 'sequential')[]
}
export interface RenderedFile {
  content: string
  mode: 0o644 | 0o755
}
export interface Adapter {
  id: string
  manifestPath: string
  launchers?: boolean
  artifacts?(version: string): ReadonlyMap<string, RenderedFile>
  capabilities(): AdapterCapabilities
  renderSkill(name: string, content: string): RenderedFile
  renderAgent(name: string, content: string): RenderedFile
  name(kind: 'skill' | 'agent', name: string): string
  paths(kind: 'skill' | 'agent', name: string): string
  manifest(
    version: string,
    components?: { skills: readonly string[]; agents: readonly string[] },
  ): unknown
}
