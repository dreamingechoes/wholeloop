export interface Asset {
  path: string
  kind: 'skill' | 'agent' | 'instruction' | 'convention' | 'quality' | 'design'
  name: string
  description: string
  slots: string[]
}
export interface CommandAsset {
  ref: string
  cwd: string
  argv: string[]
  priority: number
  reason: string
}
export interface CapabilityMap {
  schema: 'wholeloop/discover@1'
  assets: Asset[]
  commands: CommandAsset[]
  problems: { file: string; message: string }[]
}
