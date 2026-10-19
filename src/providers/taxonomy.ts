export const TAXONOMY = {
  'source.web': ['query'],
  'source.code': ['query'],
  'source.product-analytics': ['query'],
  'source.bi': ['query'],
  'source.support': ['query'],
  'source.errors': ['query'],
  'source.observability': ['query'],
  'source.knowledge': ['query'],
  'source.feedback': ['query'],
  'source.meetings': ['query'],
  docs: ['create', 'read', 'update', 'link'],
  tracker: ['create-item', 'read-item', 'update-item', 'link-items', 'transition'],
  codehost: ['open-draft-pr', 'read-pr', 'pr-status', 'comment-pr'],
  dashboards: ['create', 'update', 'read'],
  flags: ['read-state', 'propose-change'],
  comms: ['draft'],
  design: ['read-context'],
} as const
export type Capability = keyof typeof TAXONOMY
export const OPERATIONS = new Set(
  Object.entries(TAXONOMY).flatMap(([capability, verbs]) =>
    verbs.map((verb) => `${capability}.${verb}`),
  ),
)
