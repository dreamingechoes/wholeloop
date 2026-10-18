import { isObject, type Schema, validate } from '../config/schema.js'
import { checkShape } from '../flow/registry.js'
import { FRAME_SECTIONS } from '../framing/contract.js'
import { frontmatter } from '../harness/frontmatter.js'
import { PRESETS } from '../profile/presets.js'
import type { CatalogAdapter, Manifest } from './catalog.js'
import { MANIFEST_ID } from './common.js'
import lensSchema from './schemas/lens-v1.json' with { type: 'json' }
import profileSchema from './schemas/profile-v1.json' with { type: 'json' }
import templateSchema from './schemas/template-v1.json' with { type: 'json' }

export interface Template extends Manifest {
  sections: { required: string[]; optional: string[] }
  content: string
}
export interface ProfileManifest extends Manifest {
  dials: Record<string, string>
}
export interface Lens extends Manifest {
  gate: 'review' | 'verify'
  asks: string
  'applies-when'?: Record<string, string[]>
  'fail-safe': boolean
  prompt: string
}
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(text) && new Set(value).size === value.length

function base(value: unknown, fields: readonly string[], schema: Schema): Record<string, unknown> {
  const problems = validate(value, schema, 'manifest')
  if (problems.length) throw new Error(problems.join('\n'))
  if (
    !isObject(value) ||
    value.schema !== 1 ||
    !text(value.id) ||
    !MANIFEST_ID.test(value.id) ||
    Object.keys(value).some((key) => !['schema', 'id', 'extends', ...fields].includes(key)) ||
    (value.extends !== undefined && !text(value.extends))
  )
    throw new Error('Expected a schema 1 manifest with a kebab-case id and known fields')
  return value
}

const REQUIRED: Record<string, Record<string, string>> = {
  frame: Object.fromEntries(
    FRAME_SECTIONS.map((name) => [
      name.toLowerCase(),
      name === 'Owner' ? 'initiative ownership' : 'frame-problem',
    ]),
  ),
  spec: {
    problem: 'write-spec',
    users: 'write-spec',
    stories: 'slice-work',
    criteria: 'verify-works',
    metrics: 'measure-impact',
    rollout: 'prepare-launch',
    'measurement plan': 'measure-impact',
    'technical appendix': 'build-slice',
  },
}
const TEMPLATES: Template[] = Object.entries(REQUIRED).map(([id, sections]) => ({
  schema: 1,
  id,
  sections: { required: Object.keys(sections), optional: [] },
  content: `# {{title}}\n\n${Object.keys(sections)
    .map((section) => `## ${section}\n\nTBD: supply evidence; who: initiative owner`)
    .join('\n\n')}\n`,
}))

export const templateAdapter: CatalogAdapter<Template> = {
  kind: 'templates',
  filename: 'template.md',
  builtins: TEMPLATES,
  parse(content) {
    const data = frontmatter(content.replaceAll('\r\n', '\n'))
    if (!data) throw new Error('Template needs YAML front matter')
    return { ...data, content: content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') }
  },
  validate(value, parent) {
    const data = base(value, ['sections', 'content'], templateSchema)
    if (
      !isObject(data.sections) ||
      Object.keys(data.sections).some((key) => !['required', 'optional'].includes(key)) ||
      !strings(data.sections.required) ||
      !data.sections.required.length ||
      (data.sections.optional !== undefined && !strings(data.sections.optional)) ||
      !text(data.content)
    )
      throw new Error('Template needs required sections, optional sections and Markdown content')
    const required = data.sections.required
    const mandatory = {
      ...(REQUIRED[data.id as string] ?? {}),
      ...Object.fromEntries(
        (parent?.sections.required ?? []).map((section) => [
          section,
          REQUIRED[parent?.id ?? '']?.[section] ?? `template ${parent?.id}`,
        ]),
      ),
    }
    for (const [section, consumer] of Object.entries(mandatory))
      if (!required.includes(section))
        throw new Error(`Required section ${section} cannot be removed; ${consumer} depends on it`)
    const problems = checkShape(data.content, required)
    if (problems.length) throw new Error(problems.join('\n'))
    const optional = data.sections.optional ?? []
    if (optional.some((section) => required.includes(section)))
      throw new Error('Required and optional sections cannot overlap')
    return { ...data, sections: { required, optional } } as unknown as Template
  },
}

export const profileAdapter: CatalogAdapter<ProfileManifest> = {
  kind: 'profiles',
  filename: 'profile.yml',
  builtins: Object.entries(PRESETS).map(([id, dials]) => ({ schema: 1, id, dials: { ...dials } })),
  validate(value) {
    const data = base(value, ['dials'], profileSchema)
    if (
      !isObject(data.dials) ||
      !Object.keys(data.dials).length ||
      Object.hasOwn(data.dials, 'preset')
    )
      throw new Error('Profile needs dials; preset references belong in extends')
    const problems = validate({ profile: data.dials })
    if (problems.length) throw new Error(problems.join('\n'))
    return data as unknown as ProfileManifest
  },
}

export const lensAdapter: CatalogAdapter<Lens> = {
  kind: 'lenses',
  filename: 'lens.yml',
  builtins: [],
  validate(value) {
    const data = base(value, ['gate', 'asks', 'applies-when', 'fail-safe', 'prompt'], lensSchema)
    if (
      !['review', 'verify'].includes(String(data.gate)) ||
      !text(data.asks) ||
      typeof data['fail-safe'] !== 'boolean' ||
      !text(data.prompt) ||
      data.prompt.startsWith('/') ||
      data.prompt.split(/[\\/]/).includes('..')
    )
      throw new Error('Lens needs gate, asks, fail-safe and a relative prompt file')
    const when = data['applies-when']
    if (
      when !== undefined &&
      (!isObject(when) ||
        Object.entries(when).some(
          ([key, value]) => !['paths', 'languages', 'slots'].includes(key) || !strings(value),
        ))
    )
      throw new Error('Lens applicability accepts paths, languages and slots arrays')
    return data as unknown as Lens
  },
  resources: (value) => [{ id: 'prompt', field: ['prompt'], path: value.prompt, maxLines: 40 }],
}
