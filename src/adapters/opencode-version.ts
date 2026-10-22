/** Rendering is pure: the caller supplies an observed version or explicitly chooses the legacy default. */
export function openCodeMajor(version?: string): 1 | 2 {
  if (version === undefined) return 1
  if (!/^[12]\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
    throw new Error('OpenCode native rendering requires an exact supported 1.x or 2.x version')
  return version.startsWith('2.') ? 2 : 1
}
