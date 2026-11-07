// Count roadmap tasks by status from the phase files, and with --check fail
// when roadmap/README.md states different totals. Closing a task updates
// those totals by hand in several places; this keeps them honest.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function roadmapTasks(directory) {
  const tasks = []
  for (const file of readdirSync(directory)
    .filter((name) => /^phase-\d+-.+\.md$/.test(name))
    .sort()) {
    const lines = readFileSync(join(directory, file), 'utf8').split('\n')
    lines.forEach((line, index) => {
      const heading = /^## (P\d+-\d+) · /.exec(line)
      if (!heading?.[1]) return
      // A moved task keeps a redirect heading without a status line of its own.
      const next = lines
        .slice(index + 1, index + 6)
        .find((text) => text.startsWith('## ') || text.startsWith('**Status:**'))
      const status = /^\*\*Status:\*\* (\S+)/.exec(next ?? '')?.[1]
      if (status) tasks.push({ id: heading[1], file, status })
    })
  }
  return tasks
}

export function roadmapCounts(tasks) {
  const complete = tasks.filter((task) => task.status === '✅').length
  return { total: tasks.length, complete, open: tasks.length - complete }
}

/** The totals roadmap/README.md states, or undefined when the sentence is missing. */
export function statedCounts(readme) {
  const match = /contains (\d+) tasks: (\d+) completed tasks/.exec(readme)
  return match ? { total: Number(match[1]), complete: Number(match[2]) } : undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const counts = roadmapCounts(roadmapTasks(join(root, 'roadmap')))
  if (process.argv.includes('--check')) {
    const stated = statedCounts(readFileSync(join(root, 'roadmap/README.md'), 'utf8'))
    if (!stated || stated.total !== counts.total || stated.complete !== counts.complete) {
      console.error(
        `roadmap: README states ${stated ? `${stated.total} tasks, ${stated.complete} complete` : 'no totals'}; the phase files have ${counts.total} tasks, ${counts.complete} complete`,
      )
      process.exitCode = 1
    } else
      console.log(
        `roadmap: ${counts.total} tasks, ${counts.complete} complete, ${counts.open} open`,
      )
  } else console.log(JSON.stringify(counts))
}
