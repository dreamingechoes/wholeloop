// Keeps canonical role names and worker handoffs independent of a client's native spelling.

export function canonicalRoles(files: ReadonlyMap<string, string>) {
  return [...files.keys()]
    .flatMap((path) => {
      const name = /^harness\/agents\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(path)?.[1]
      return name ? [name] : []
    })
    .sort()
}

export function roleReferences(
  content: string,
  roles: readonly string[],
  name: (role: string) => string,
) {
  if (!roles.length) return content
  return content.replace(
    new RegExp(`(?<![a-z0-9-])wl-(${roles.join('|')})(?![a-z0-9-])`, 'g'),
    (_match, role: string) => name(role),
  )
}

export function agentContext(canInvokeCore: boolean) {
  return canInvokeCore
    ? 'The conductor supplies wholeloopRoot and the checked skill launcher. Read protocols under wholeloopRoot/resources/protocols/; invoke canonical wl commands through that launcher. Missing context returns a question; never guess PATH.\n\n'
    : 'Use only the supplied assignment, required protocol text and observed evidence. Return the exact requested result in your final message; the conductor validates and submits it. If a required tool or input is absent, return unavailable with a reason. Never obtain wider tools or import conversation history.\n\n'
}

/** A mapped model other than `inherit`; `inherit` renders exactly like the default elsewhere. */
export const mappedModel = (model?: string) => (model && model !== 'inherit' ? model : undefined)

/** Says which model was configured without claiming the client has it or will honour it. */
export function tierSentence(tier: string, model: string | undefined, inherited: string) {
  const mapped = mappedModel(model)
  return mapped
    ? `Canonical model tier: ${tier}; configured for this client as model ${mapped}.`
    : inherited
}

/** Claude's plugin scope and installed loose-agent scope have distinct callable names. */
export function roleInvocationName(
  target: string,
  role: string,
  declared: string,
  overlay = false,
) {
  return target === 'claude' ? (overlay ? `wl-${role}` : `wholeloop:${declared}`) : declared
}
