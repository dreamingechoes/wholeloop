// Recognizes simple Git argv in a hook payload; anything more complex falls back to the real Git
// hooks.
import { resolve } from 'node:path'

/** Recognize simple argv only; arbitrary shell programs still need the actual Git hook fallback. */
export function simpleWords(command: string): string[] | undefined {
  const words: string[] = []
  let word = ''
  let quote: string | undefined
  let escaped = false
  let started = false
  for (const character of command) {
    if (escaped) {
      word += character
      escaped = false
      started = true
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      started = true
      continue
    }
    if (quote) {
      if (quote === '"' && /[`$]/.test(character)) return undefined
      if (character === quote) quote = undefined
      else word += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (/[;&|<>`$()\n\r]/.test(character)) return undefined
    if (/\s/.test(character)) {
      if (started) {
        words.push(word)
        word = ''
        started = false
      }
    } else {
      word += character
      started = true
    }
  }
  if (quote || escaped) return undefined
  if (started) words.push(word)
  return words
}
export function gitInvocation(command: string, cwd: string) {
  const words = simpleWords(command)
  if (!words) return undefined
  let index = 0
  if (words[index] === 'env') index++
  while (words[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? '')) index++
  if (!/(?:^|\/)git$/.test(words[index] ?? '')) return undefined
  index++
  let directory = cwd
  let bypass = false
  while (words[index]?.startsWith('-')) {
    const option = words[index++]
    if (option === '-C') {
      const path = words[index++]
      if (!path) return undefined
      directory = resolve(directory, path)
    } else if (option === '-c') {
      const setting = words[index++]
      if (!setting) return undefined
      if (/^core\.hooksPath=/i.test(setting)) bypass = true
    } else if (option?.startsWith('--git-dir') || option?.startsWith('--work-tree'))
      return undefined
    else return undefined
  }
  const action = words[index++]
  if (action !== 'commit' && action !== 'push') return undefined
  const args = words.slice(index)
  return {
    action,
    cwd: directory,
    args,
    bypass: bypass || args.some((value) => ['--no-verify', '-n'].includes(value)),
  }
}
