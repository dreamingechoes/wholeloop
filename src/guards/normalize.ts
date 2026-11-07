// Normalizes each client's hook payload into one tool shape without echoing arguments or file
// bodies.
import { isAbsolute, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { ITEM_ID } from '../state/events.js'
import { canonicalPath, inside } from '../state/paths.js'

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
  const native = value.toolCall
  if (
    native !== undefined &&
    (!isObject(native) || typeof native.name !== 'string' || !isObject(native.args))
  )
    throw new Error('Invalid native tool call; contents omitted')
  const call = isObject(native) ? native : undefined
  const name = call?.name ?? value.tool_name ?? value.toolName ?? value.tool
  if (typeof name !== 'string' || !name.trim()) throw new Error('Hook payload needs a tool name')
  let args: unknown =
    call?.args ??
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
  const cursor = value.workspace_roots !== undefined
  if (
    cursor &&
    (!Array.isArray(value.workspace_roots) ||
      value.workspace_roots.length > 32 ||
      value.workspace_roots.some((path) => typeof path !== 'string' || !isAbsolute(path)))
  )
    throw new Error('Invalid native workspace roots; contents omitted')
  const workspaces = value.workspacePaths
  if (
    call &&
    (!Array.isArray(workspaces) ||
      workspaces.length > 32 ||
      workspaces.some((path) => typeof path !== 'string' || !isAbsolute(path)))
  )
    throw new Error('Native tool call needs explicit workspace context')
  const target =
    args.Cwd ??
    args.TargetFile ??
    args.AbsolutePath ??
    args.DirectoryPath ??
    args.SearchDirectory ??
    args.SearchPath
  if (call && target !== undefined && (typeof target !== 'string' || !isAbsolute(target)))
    throw new Error('Native tool target must be absolute; contents omitted')
  const roots = Array.isArray(workspaces)
    ? workspaces
        .filter((path): path is string => typeof path === 'string')
        .map((path) => canonicalPath(resolve(root, path)))
    : []
  const candidates =
    typeof target === 'string'
      ? roots.filter((path) => inside(path, canonicalPath(resolve(root, target))))
      : roots
  // A single workspace still supplies cwd for legitimate external artifact writes.
  const matches =
    !candidates.length && args.Cwd === undefined && roots.length === 1 ? roots : candidates
  const nativeDirectory = call
    ? (args.Cwd ?? (matches.length === 1 ? matches[0] : undefined))
    : undefined
  if (
    call &&
    (typeof nativeDirectory !== 'string' ||
      !matches.some((path) => inside(path, canonicalPath(resolve(root, nativeDirectory)))))
  )
    throw new Error('Native workspace context is missing or ambiguous')
  const tool =
    name
      .split(/\.|\/|__/)
      .at(-1)
      ?.toLowerCase() ?? ''
  // Gemini ignores generic cwd/workdir arguments; classify the directory its native tool uses.
  const directory =
    nativeDirectory ??
    (tool === 'run_shell_command'
      ? (args.dir_path ?? value.cwd ?? root)
      : tool === 'shell' && cursor
        ? (args.working_directory ?? value.cwd ?? root)
        : (args.workdir ?? args.cwd ?? value.cwd ?? root))
  if (typeof directory !== 'string' || !directory.trim())
    throw new Error('Hook payload needs its working directory')
  const cwd = canonicalPath(resolve(root, directory))
  const kind =
    name === 'wholeloop.state.write'
      ? 'state-write'
      : /^(bash|shell|exec_command|run_shell_command|run_command|powershell)$/.test(tool)
        ? 'shell'
        : /^(write|edit|create|delete|delete_file|apply_patch|patch|write_file|edit_file|replace|str_replace_editor|write_to_file|replace_file_content|multi_replace_file_content)$/.test(
              tool,
            )
          ? 'write'
          : /^(read|view|read_file|glob|grep|view_file|list_dir|find_by_name|grep_search|search_web|read_url_content)$/.test(
                tool,
              )
            ? 'read'
            : 'other'
  const command = args.CommandLine ?? args.command ?? args.cmd
  if (kind === 'shell' && typeof command !== 'string')
    throw new Error('Shell guard needs its command string')
  const paths = [
    args.file_path,
    args.filePath,
    args.path,
    ...(call && /^(write_to_file|replace_file_content|multi_replace_file_content)$/.test(tool)
      ? [args.TargetFile]
      : []),
    ...(Array.isArray(args.paths) ? args.paths : []),
  ].filter((path) => path !== undefined)
  if (paths.some((path) => typeof path !== 'string' || !path.trim()))
    throw new Error('Write guard needs explicit file paths')
  if (
    /^(apply_patch|patch)$/.test(tool) &&
    typeof (args.patch ?? args.input ?? args.patchText) === 'string'
  )
    for (const match of String(args.patch ?? args.input ?? args.patchText).matchAll(
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
