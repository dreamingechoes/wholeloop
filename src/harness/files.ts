export interface Finding {
  file: string
  line?: number
  rule: 'budget' | 'frontmatter' | 'enforcement'
  message: string
}

export interface HarnessTree {
  files: ReadonlyMap<string, string>
  read: (path: string) => string | undefined
}

export function lineCount(content: string): number {
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length
}
