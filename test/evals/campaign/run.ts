import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { campaignMarkdown, campaignReport, type LiveTrial } from './report.js'

/**
 * Usage: npm run eval:campaign -- [--require EVAL-10:claude,...] <trial dir or report.json>...
 * A trial directory is the retained live-trial store; its results/report.json is read.
 * Prints the JSON report, then a Markdown summary. Reads only; writes nothing.
 */
const args = process.argv.slice(2),
  requireIndex = args.indexOf('--require'),
  required =
    requireIndex >= 0
      ? (args[requireIndex + 1] ?? '').split(',').map((entry) => {
          const [scenario = '', target = ''] = entry.split(':')
          return { scenario, target }
        })
      : [],
  inputs = args.filter((_, index) => index !== requireIndex && index !== requireIndex + 1)
if (!inputs.length) throw new Error('Name at least one live trial directory or report')
const trials = inputs.map((input) => {
  const path = statSync(input).isDirectory() ? join(input, 'results', 'report.json') : input
  if (!existsSync(path)) throw new Error(`No live trial report at ${path}`)
  return JSON.parse(readFileSync(path, 'utf8')) as LiveTrial
})
const report = campaignReport(trials, required)
console.log(JSON.stringify(report, null, 2))
console.log(campaignMarkdown(report))
