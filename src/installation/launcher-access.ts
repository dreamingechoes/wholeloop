// The narrowest client rule that would let installed skills run their own wl launchers without
// asking each time. Install only shows it: writing it would widen what runs without approval.
import { dirname, isAbsolute, join } from 'node:path'
import { stringify } from 'smol-toml'
import { type InstallContext, installedName, installLocations, sharedLauncher } from './plan.js'

export interface LauncherAccess {
  target: string
  /** Where the person would add the rule; null when it is a launch flag or no rule exists. */
  file: string | null
  snippet: string | null
  rules: number
  applied: false
  verified: false
  note: string
}

const UNSUPPORTED =
  'No command-level allow rule is known for this client; approve each launcher call when asked.'

/**
 * Client permission patterns treat these characters as syntax and document no escape, so a
 * launcher path containing one cannot be matched exactly; the rule is withheld instead.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused on purpose.
const UNSAFE = /[\u0000-\u001f\u007f\s"'`*?[\]{}()\\$!;&|<>:]/

export function launcherAccess(input: {
  target: string
  scope: 'user' | 'project'
  root: string
  /** The client's own configuration directory, as install resolved it. */
  base: string
  launchers: readonly string[]
}): LauncherAccess {
  const { target, scope, root, base, launchers } = input
  const none = (note: string): LauncherAccess => ({
    target,
    file: null,
    snippet: null,
    rules: 0,
    applied: false,
    verified: false,
    note,
  })
  if (!launchers.length) return none('No launcher was installed for this client.')
  if (launchers.some((path) => !path.startsWith('/') || UNSAFE.test(path)))
    return none(
      'A launcher path contains characters this client treats as pattern syntax; approve each call when asked.',
    )
  const sorted = [...launchers].sort()
  const result = (file: string | null, snippet: string, note: string): LauncherAccess => ({
    target,
    file,
    snippet,
    rules: sorted.length,
    applied: false,
    verified: false,
    note,
  })
  const named = sorted.length === 1 ? 'this launcher' : 'these launchers'
  const review = `Review only; nothing was written. It allows exactly ${named}, with any arguments, and nothing else.`
  if (target === 'claude')
    return result(
      join(base, scope === 'user' ? 'settings.json' : 'settings.local.json'),
      JSON.stringify({ permissions: { allow: sorted.map((path) => `Bash(${path}:*)`) } }, null, 2),
      review,
    )
  if (target === 'opencode')
    return result(
      scope === 'user' ? join(base, 'opencode.json') : join(root, 'opencode.json'),
      JSON.stringify(
        { permission: { bash: Object.fromEntries(sorted.map((path) => [`${path} *`, 'allow'])) } },
        null,
        2,
      ),
      review,
    )
  if (target === 'gemini')
    return result(
      join(base, 'policies/wholeloop.toml'),
      stringify({
        rule: sorted.map((path) => ({
          toolName: 'run_shell_command',
          commandPrefix: path,
          decision: 'allow',
          priority: 100,
        })),
      }),
      review,
    )
  if (target === 'codex')
    return result(
      join(base, 'rules/wholeloop.rules'),
      sorted
        .map((path) => `prefix_rule(pattern = [${JSON.stringify(path)}], decision = "allow")`)
        .join('\n'),
      review,
    )
  if (target === 'cursor')
    return result(
      join(base, scope === 'user' ? 'cli-config.json' : 'cli.json'),
      JSON.stringify({ permissions: { allow: sorted.map((path) => `Shell(${path})`) } }, null, 2),
      review,
    )
  if (target === 'copilot')
    return result(
      null,
      sorted.map((path) => `--allow-tool 'shell(${path})'`).join(' \\\n'),
      `Review only; add ${sorted.length === 1 ? 'this flag' : 'these flags'} when starting the client. ${sorted.length === 1 ? 'It allows' : 'They allow'} exactly ${named} and nothing else.`,
    )
  return none(UNSUPPORTED)
}

/** The installed skill launchers of each target, as installation writes them (plan.ts). */
export function installedLauncherAccess(
  targets: readonly string[],
  context: InstallContext,
  canonical: ReadonlyMap<string, string>,
): LauncherAccess[] {
  const env = context.env ?? process.env
  const skills = [...canonical.keys()].flatMap(
    (path) => /^harness\/skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1] ?? [],
  )
  const configured = (value: string | undefined, fallback: string) =>
    value && isAbsolute(value) ? value : fallback
  return targets.map((target) => {
    const locations = installLocations(target, context)
    const own = dirname(locations.skills)
    // Command rules for Codex and Gemini live in the person's own client home at either scope.
    const base =
      target === 'codex'
        ? configured(env.CODEX_HOME, join(context.home, '.codex'))
        : target === 'gemini'
          ? join(configured(env.GEMINI_CLI_HOME, context.home), '.gemini')
          : own
    const shared = sharedLauncher(target, context)
    return launcherAccess({
      target,
      scope: context.scope,
      root: context.root,
      base,
      launchers: shared
        ? [shared]
        : skills.map((skill) =>
            join(locations.skills, installedName(target, 'skill', skill), 'scripts/wl.mjs'),
          ),
    })
  })
}
