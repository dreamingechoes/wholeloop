// The private research plan the public host reviews before research and consumes after.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import { DeliverySources } from '../delivery/source.js'
import { type ResearchPlan, validatePlan } from '../research/contracts.js'
import type { RunnerStageContext } from './engine.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

type ResearchContext = Pick<RunnerStageContext, 'request' | 'plan'>

/** The same private plan is reviewed before research and consumed afterward. */
export class PublicResearchPlan {
  constructor(readonly store: RunnerStore) {}

  private selected(context: ResearchContext) {
    if (
      context.plan.policy.endpoint !== 'research-report' ||
      context.request.run !== context.plan.run ||
      context.request.revision !== context.plan.revision ||
      contractDigest(context.plan) !== context.request.plan
    )
      throw new DeliveryRunnerError('public-research-plan-scope')
    const plan: ResearchPlan = {
      schema: 'wholeloop/research-plan@1',
      subject: context.request.run,
      run: context.request.run,
      question: new DeliverySources(this.store.files.root).get(context.plan.source).body,
      owner: context.plan.owner,
      verifiers: 3,
      refutations: 2,
      angles: [
        {
          id: 'native-web:source.web',
          provider: 'native-web',
          capability: 'source.web',
          operation: 'source.web.query',
          available: true,
          evidence:
            "Use the bound client's read-only search and fetch to examine primary public sources for every subject, platform and requested limitation in the pinned question. Identify applicable versions and source dates, cite retained claims, and preserve missing, inaccessible or contradictory evidence as open questions.",
        },
      ],
      openQuestions: [],
    }
    validatePlan(plan)
    const body = JSON.stringify(plan)
    safeSourceText(body, 1024 * 1024)
    return {
      plan,
      body,
      artifact: {
        ref: `delivery/public-research-plans/${context.request.plan}.json`,
        sha256: sourceHash(body),
      },
    }
  }

  prepare(context: ResearchContext) {
    const selected = this.selected(context)
    this.store.files.locked(() => {
      if (!existsSync(this.store.files.path(selected.artifact.ref)))
        this.store.files.atomic(selected.artifact.ref, selected.body)
      this.read(context)
    })
    return selected.artifact
  }

  read(context: ResearchContext): ResearchPlan {
    const selected = this.selected(context),
      body = readSourceFile(this.store.files.root, selected.artifact.ref, 1024 * 1024)
    // Recomputing the expected bytes is conservative across controller upgrades:
    // a changed selector refuses instead of replacing an already reviewed plan.
    if (body !== selected.body) throw new DeliveryRunnerError('public-research-plan-changed')
    return selected.plan
  }
}
