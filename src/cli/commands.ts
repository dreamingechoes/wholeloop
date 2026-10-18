export interface Command {
  path: string
  arguments: string
  options: readonly string[]
  schema: string
  summary: string
}

export const COMMANDS: readonly Command[] = [
  {
    path: 'config show',
    arguments: '',
    options: ['--explain', '--initiative-config <file>', '--run-config <file>'],
    schema: 'wholeloop/config-show@1',
    summary: 'Resolve layered configuration and optionally explain every value',
  },
  {
    path: 'config schema',
    arguments: '',
    options: [],
    schema: 'wholeloop/config-schema@1',
    summary: 'Print the configuration JSON Schema',
  },
  {
    path: 'docs nav',
    arguments: '',
    options: [],
    schema: 'wholeloop/docs-nav@1',
    summary: 'Rewrite docnav footers from docs/nav.yml',
  },
  {
    path: 'docs check',
    arguments: '',
    options: [],
    schema: 'wholeloop/docs-check@1',
    summary: 'Check documentation navigation, status, links and anchors',
  },
  {
    path: 'harness check',
    arguments: '',
    options: [],
    schema: 'wholeloop/harness-check@1',
    summary: 'Check size budgets, front matter and enforcement',
  },
  {
    path: 'guard commit-msg',
    arguments: '<file>',
    options: [],
    schema: 'wholeloop/commit-check@1',
    summary: 'Validate a commit message without changing it',
  },
]
