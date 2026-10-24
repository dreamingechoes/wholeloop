const PROCESS_BOOKKEEPING: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  darwin: ['__CF_USER_TEXT_ENCODING'],
  linux: [],
}

/** Observed macOS launches add locale bookkeeping even with an explicit child environment. */
export function environmentNames(platform: NodeJS.Platform, names: readonly string[]): string[] {
  const additions = PROCESS_BOOKKEEPING[platform]
  if (!additions) throw new Error('Environment probes require macOS or Linux')
  return names.filter((name) => !additions.includes(name)).sort()
}
