import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { evaluatePrivate } from './private-engine.js'

try {
  const bootstrap = readFileSync(0)
  if (bootstrap.length > 65536) throw new Error('Private bootstrap limit')
  const configuration = JSON.parse(bootstrap.toString('utf8')) as {
    schema: string
    origin: string
    definition: string
    runner: string
    deadline: string
    limit: number
  }
  if (
    Object.keys(configuration).sort().join(',') !==
      'deadline,definition,limit,origin,runner,schema' ||
    configuration.schema !== 'wholeloop/private-evaluator-bootstrap@1' ||
    !/^[a-f0-9]{64}$/.test(configuration.definition) ||
    !/^[a-f0-9]{64}$/.test(configuration.runner)
  )
    throw new Error('Invalid private bootstrap')
  const source = readFileSync('/private/runner.mjs')
  if (createHash('sha256').update(source).digest('hex') !== configuration.runner)
    throw new Error('Changed private evaluator')
  const bytes = readFileSync('/private/cases.json')
  if (bytes.length > 1024 * 1024) throw new Error('Private case limit')
  const remaining = Date.parse(configuration.deadline) - Date.now()
  if (!Number.isFinite(remaining) || remaining < 1 || remaining > 1800000)
    throw new Error('Private deadline expired')
  const result = await evaluatePrivate(
    JSON.parse(bytes.toString('utf8')),
    configuration.origin,
    AbortSignal.timeout(Math.ceil(remaining)),
    configuration.limit,
  )
  if (result.definition !== configuration.definition) throw new Error('Changed private inputs')
  console.log(JSON.stringify({ ...result, runner: configuration.runner }))
} catch {
  // The application and its errors may contain private data. Never echo the exception.
  console.error('Private evaluation incomplete; contents omitted')
  process.exitCode = 2
}
