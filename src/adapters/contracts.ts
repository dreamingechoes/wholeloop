export interface AdapterCapabilities {
  conformance: 'unverified'
  skills: 'rendered'
  agents: 'rendered'
  hooks: 'unimplemented'
  readOnly: 'tool-allowlist-and-plan-mode'
  engines: readonly ['headless', 'sequential']
}
export interface RenderedFile {
  content: string
  mode: 0o644 | 0o755
}
export interface Adapter {
  id: string
  capabilities(): AdapterCapabilities
  renderSkill(name: string, content: string): RenderedFile
  renderAgent(name: string, content: string): RenderedFile
  paths(kind: 'skill' | 'agent', name: string): string
  manifest(version: string): unknown
}
