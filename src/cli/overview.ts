import { OverviewError } from '../overview/cursor.js'
import { overviewProblem, projectOverview } from '../overview/project.js'
import { readOverview } from '../overview/read.js'
import overview from '../overview/schemas/overview-v1.json' with { type: 'json' }
import watch from '../overview/schemas/watch-frame-v1.json' with { type: 'json' }
import { EXIT, type Io } from './io.js'

/** Inspection never prepares execution, acquires a writer lock or repairs a projection. */
export function overviewCommand(command: string, root: string, json: boolean, io: Io) {
  if (command === 'overview schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/overview-schema@1',
          contracts: { overview, watch },
          available: { overview: true, watch: true },
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  try {
    const value = projectOverview(readOverview({ root }))
    io.out(JSON.stringify(value, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    io.out(
      JSON.stringify(
        overviewProblem(error instanceof OverviewError ? error.problem : 'store-unreadable'),
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.precondition
  }
}
