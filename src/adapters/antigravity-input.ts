/** One documented native user event; assignment text is data, never a slash command or argv. */
export function antigravityInput(prompt: string) {
  return `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`
}
