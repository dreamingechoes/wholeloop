// `wl guard commit-msg`: checks a commit message file against the commit rules.
import { readFileSync } from 'node:fs'
import { checkCommit } from '../git/commit.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function commitCheck(file: string | undefined, json: boolean, io: Io): number {
  if (!file)
    throw new CliError('Provide the commit message file: wl guard commit-msg <file>', EXIT.input)
  let message: string
  try {
    message = readFileSync(file, 'utf8')
  } catch {
    throw new CliError(`Cannot read commit message file: ${file}`, EXIT.precondition)
  }
  const problems = checkCommit(message)
  if (json) io.out(JSON.stringify({ schema: 'wholeloop/commit-check@1', problems }))
  else if (problems.length)
    problems.forEach((problem) => {
      io.err(`commit-msg: ${problem}`)
    })
  else io.out('commit-msg: valid')
  return problems.length ? EXIT.shape : EXIT.ok
}
