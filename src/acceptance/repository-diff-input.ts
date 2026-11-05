import { contractDigest } from '../contracts/compatibility.js'
import { type AcceptanceCase, AcceptanceError, acceptanceShape } from './contracts.js'
import schema from './schemas/repository-diff-input-v1.json' with { type: 'json' }

export const REPOSITORY_DIFF_INPUT_SCHEMA = schema
export function repositoryDiffFixture(repository: string, base: string) {
  return { ref: `repository:${repository}@${base}`, sha256: contractDigest({ repository, base }) }
}
/** Workers select an authorized repository, never a root, revision or executable. */
export function repositoryDiffInput(test: AcceptanceCase): { repository: string } {
  let value: unknown
  try {
    value = JSON.parse(test.runner.input)
  } catch {
    throw new AcceptanceError('invalid-repository-diff-input')
  }
  acceptanceShape(value, schema)
  if (test.runner.kind !== 'cli' || test.runner.capability !== 'repository.diff')
    throw new AcceptanceError('repository-diff-capability')
  for (const assertion of test.assertions) {
    const path = assertion.path ?? ''
    if (
      assertion.subject !== 'json' ||
      (path !== '' && !path.startsWith('/')) ||
      /~(?:[^01]|$)/.test(path) ||
      path
        .split('/')
        .some((part) =>
          ['__proto__', 'constructor', 'prototype'].includes(
            part.replace(/~1/g, '/').replace(/~0/g, '~'),
          ),
        )
    )
      throw new AcceptanceError('unsupported-repository-diff-assertion')
  }
  return { repository: (value as { repository: string }).repository }
}
