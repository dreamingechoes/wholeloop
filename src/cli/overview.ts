// `wl overview`: reads operator attention and progress without writing anything.
import { OverviewError } from '../overview/cursor.js'
import { overviewProblem, projectOverview } from '../overview/project.js'
import { readOverview } from '../overview/read.js'
import overview from '../overview/schemas/overview-v1.json' with { type: 'json' }
import watch from '../overview/schemas/watch-frame-v1.json' with { type: 'json' }
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

/** Inspection never prepares execution, acquires a writer lock or repairs a projection. */
export function overviewCommand(command: string, root: string, json: boolean, io: Io) {
  if (command === 'overview schema') {
    emitCommand(
      command,
      {
        schema: 'wholeloop/overview-schema@1',
        contracts: { overview, watch },
        available: { overview: true, watch: true },
      },
      io,
      json,
    )
    return EXIT.ok
  }
  try {
    const value = projectOverview(readOverview({ root }))
    emitCommand(command, value, io, json)
    return EXIT.ok
  } catch (error) {
    emitCommand(
      command,
      overviewProblem(error instanceof OverviewError ? error.problem : 'store-unreadable'),
      io,
      json,
    )
    return EXIT.precondition
  }
}
