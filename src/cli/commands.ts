export interface Command {
  path: string
  arguments: string
  options: readonly string[]
  schema: string
  summary: string
}

export const COMMANDS: readonly Command[] = [
  {
    path: 'msg send',
    arguments: '',
    options: [
      '--thread <id>',
      '--to <role>',
      '--from <role>',
      '--kind <kind>',
      '--body <text>',
      '--body-file <file>',
    ],
    schema: 'wholeloop/msg-send@1',
    summary: 'Send a durable message in an item thread',
  },
  {
    path: 'msg read',
    arguments: '',
    options: ['--for <role>', '--reader <id>', '--peek'],
    schema: 'wholeloop/msg-read@1',
    summary: 'Read unread messages with a persistent per-reader cursor',
  },
  {
    path: 'handoff',
    arguments: '<id>',
    options: ['--to <role>', '--from <role>', '--body <text>', '--body-file <file>'],
    schema: 'wholeloop/handoff@1',
    summary: 'Hand an item to another role with durable context',
  },
  {
    path: 'resume',
    arguments: '[<id>]',
    options: ['--for <role>', '--reader <id>'],
    schema: 'wholeloop/resume@1',
    summary: 'Print a context pack bounded to 6144 UTF-8 bytes',
  },
  {
    path: 'state create',
    arguments: '<kind>',
    options: ['--title <text>', '--owner <name>', '--body-file <file>', '--parent <id>'],
    schema: 'wholeloop/state-create@1',
    summary: 'Create a typed item in the external store',
  },
  {
    path: 'state update',
    arguments: '<id>',
    options: ['--title <text>', '--owner <name>', '--body-file <file>', '--status <status>'],
    schema: 'wholeloop/state-update@1',
    summary: 'Update a stored item through the journal',
  },
  {
    path: 'state show',
    arguments: '[<id>]',
    options: [],
    schema: 'wholeloop/state-show@1',
    summary: 'Show an item or the whole store',
  },
  {
    path: 'state list',
    arguments: '',
    options: [],
    schema: 'wholeloop/state-list@1',
    summary: 'List stored item summaries',
  },
  {
    path: 'state get',
    arguments: '<id>',
    options: [],
    schema: 'wholeloop/state-get@1',
    summary: 'Get a complete stored item',
  },
  {
    path: 'state rebuild',
    arguments: '',
    options: [],
    schema: 'wholeloop/state-rebuild@1',
    summary: 'Rebuild projections from the journal',
  },
  {
    path: 'note',
    arguments: '<id> <text>',
    options: [],
    schema: 'wholeloop/note@1',
    summary: 'Append a durable note',
  },
  {
    path: 'link',
    arguments: '<id> <url>',
    options: [],
    schema: 'wholeloop/link@1',
    summary: 'Record an external reference',
  },
  {
    path: 'open',
    arguments: '<id>',
    options: [],
    schema: 'wholeloop/open@1',
    summary: 'Print the item as Markdown',
  },
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
