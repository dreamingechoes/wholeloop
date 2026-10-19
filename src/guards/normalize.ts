import { resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { ITEM_ID } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'

export interface GuardTool {
  event: 'before-tool'
  cwd: string
  kind: 'shell' | 'write' | 'read' | 'state-write' | 'other'
  command?: string
  paths: string[]
  subject?: string
}
/** Native payloads remain transient; reports never echo tool arguments, commands or file bodies. */
export function normalizeTool(value: unknown, root: string, subject?: string): GuardTool {
  if (!isObject(value)) throw new Error('Hook payload must be an object; contents omitted')
  const event = value.hook_event_name ?? value.hookEventName ?? value.event ?? value.eventType
  if (
    event !== undefined &&
    (typeof event !== 'string' ||
      !['pretooluse', 'beforetool', 'beforetooluse', 'toolcall'].includes(
        event.replace(/[-_.]/g, '').toLowerCase(),
      ))
  )
    throw new Error('Only before-tool payloads can request a tool guard decision')
  const name = value.tool_name ?? value.toolName ?? value.tool
  if (typeof name !== 'string' || !name.trim()) throw new Error('Hook payload needs a tool name')
  let args: unknown =
    value.tool_input ??
    value.toolInput ??
    value.toolArgs ??
    value.args ??
    value.arguments ??
    value.params ??
    {}
  if (typeof args === 'string')
    try {
      args = JSON.parse(args)
    } catch {
      throw new Error('Invalid tool arguments; contents omitted')
    }
  if (!isObject(args)) throw new Error('Tool arguments must be an object; contents omitted')
  const directory = args.workdir ?? args.cwd ?? value.cwd ?? root
  if (typeof directory !== 'string' || !directory.trim())
    throw new Error('Hook payload needs its working directory')
  const cwd = canonicalPath(resolve(root, directory))
  const tool =
    name
      .split(/\.|\/|__/)
      .at(-1)
      ?.toLowerCase() ?? ''
  const kind =
    name === 'wholeloop.state.write'
      ? 'state-write'
      : /^(bash|shell|exec_command|run_shell_command|powershell)$/.test(tool)
        ? 'shell'
        : /^(write|edit|create|apply_patch|write_file|edit_file|replace|str_replace_editor)$/.test(
              tool,
            )
          ? 'write'
          : /^(read|view|read_file|glob|grep)$/.test(tool)
            ? 'read'
            : 'other'
  const command = args.command ?? args.cmd
  if (kind === 'shell' && typeof command !== 'string')
    throw new Error('Shell guard needs its command string')
  const paths = [
    args.file_path,
    args.filePath,
    args.path,
    ...(Array.isArray(args.paths) ? args.paths : []),
  ].filter((path) => path !== undefined)
  if (paths.some((path) => typeof path !== 'string' || !path.trim()))
    throw new Error('Write guard needs explicit file paths')
  if (tool === 'apply_patch' && typeof (args.patch ?? args.input) === 'string')
    for (const match of String(args.patch ?? args.input).matchAll(
      /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm,
    ))
      paths.push(match[1])
  const id = subject ?? value.subject
  if (id !== undefined && (typeof id !== 'string' || !ITEM_ID.test(id)))
    throw new Error('Guard subject must be a stored typed item ID')
  return {
    event: 'before-tool',
    cwd,
    kind,
    ...(typeof command === 'string' ? { command } : {}),
    paths: [...new Set(paths.map((path) => canonicalPath(resolve(cwd, String(path)))))],
    ...(typeof id === 'string' ? { subject: id } : {}),
  }
}
