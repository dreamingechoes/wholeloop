import { expect, it } from 'vitest'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { IntegrationAssembly } from '../../../src/integration/assembly.js'
import { observedIntegrationVerification } from '../../../src/integration/verification-observation.js'
import { authorization } from '../../support/delivery.js'
import { integrationFixture } from '../../support/integration.js'

it.each(['text-claim', 'untyped-json', 'foreign-artifact', 'request-path'] as const)(
  'refuses an unsupported %s before any runtime observation or journal mutation',
  (mode) =>
    integrationFixture(async ({ store, request }) => {
      const files = store.planning.sources.files,
        assembly = new IntegrationAssembly(files.root),
        plan = store.planning.getPlan(request.run, request.revision).plan,
        grant = assembly.effects.lifecycle.authority.authorize(authorization(plan, request.plan))
      assembly.effects.lifecycle.track({
        run: request.run,
        revision: request.revision,
        grant: grant.grant.id,
      })
      const owned = assembly.prepare({
          schema: 'wholeloop/integration-assembly-request@1',
          run: request.run,
          revision: request.revision,
          plan: request.plan,
          milestone: request.milestone,
          key: 'original-audit',
          parts: request.parts,
        }),
        candidate = store.prepare(request),
        acceptance = new DeliveryAcceptance(files.root),
        artifact = acceptance.artifacts.capture(
          request.run,
          Buffer.from('{}'),
          mode === 'text-claim' ? 'text/plain' : 'application/json',
        ),
        before = contractDigest(assembly.effects.lifecycle.journal.events())
      expect(() =>
        observedIntegrationVerification(
          files.root,
          {
            schema: 'wholeloop/integration-verification-request@1',
            candidate: mode === 'request-path' ? '../outside' : candidate.digest,
            assembly: owned.digest,
            environment: `environment-${'a'.repeat(32)}`,
          },
          mode === 'foreign-artifact' ? 'f'.repeat(64) : artifact.digest,
        ),
      ).toThrow()
      expect(contractDigest(assembly.effects.lifecycle.journal.events())).toBe(before)
      expect(assembly.effects.inspect(request.run)).toHaveLength(0)
    }),
)
