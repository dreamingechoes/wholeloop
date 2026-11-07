// Replaces one generated section of a documentation page.
/** Refuse ambiguous ownership before changing any generated part of a page. */
export function replaceSection(content: string, kind: string, body: string): string {
  const start = `<!-- ${kind}:start -->`
  const end = `<!-- ${kind}:end -->`
  const begin = content.indexOf(start)
  const finish = content.indexOf(end)
  if (
    begin < 0 ||
    finish < begin + start.length ||
    content.indexOf(start, begin + start.length) !== -1 ||
    content.indexOf(end, finish + end.length) !== -1
  )
    throw new Error(`Expected one ordered ${kind} marker pair`)
  return `${content.slice(0, begin)}${start}\n${body}\n${end}${content.slice(finish + end.length)}`
}
