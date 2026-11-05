import { readFileSync } from 'node:fs'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { expect, it } from 'vitest'
import { type DeliveryEvent, deliveryEvent } from '../../../src/delivery/events.js'
import { replayDelivery } from '../../../src/delivery/reducer.js'
import { encodeCursor, journalPosition } from '../../../src/overview/cursor.js'
import overview from '../../../src/overview/schemas/overview-v1.json' with { type: 'json' }
import watch from '../../../src/overview/schemas/watch-frame-v1.json' with { type: 'json' }
import { deliveryActivity, stateActivity } from '../../../src/overview/watch.js'
import { event } from '../../../src/state/events.js'
import { OVERVIEW_CASES } from '../../support/overview-fixtures.js'

const at = '2026-11-05T00:00:00.000Z',
  provider = new AjvJsonSchemaValidator()
provider.getValidator(overview as unknown as JsonSchemaType)
const validate = provider.getValidator(watch as unknown as JsonSchemaType)
it.each(OVERVIEW_CASES)(
  'redacts every activity in the %s consumer archive with explicit provenance',
  (name) => {
    const fixture = JSON.parse(readFileSync(`test/fixtures/overview/${name}.json`, 'utf8')) as {
      journals: { delivery: DeliveryEvent[] }
    }
    for (const [index, event] of fixture.journals.delivery.entries()) {
      const activity = deliveryActivity(event),
        fromCursor = encodeCursor(journalPosition([], fixture.journals.delivery.slice(0, index))),
        cursor = encodeCursor(journalPosition([], fixture.journals.delivery.slice(0, index + 1)))
      expect(
        validate({
          schema: 'wholeloop/watch-frame@1',
          sequence: index + 1,
          at,
          resumeCursor: cursor,
          kind: 'events',
          fromCursor,
          cursor,
          progress: activity.progress,
          events: [activity],
        }),
      ).toMatchObject({ valid: true })
      expect(JSON.stringify(activity)).not.toContain('PRIVATE_')
      expect(activity).not.toHaveProperty('rationale')
      expect(activity).not.toHaveProperty('payload')
      expect(activity).not.toHaveProperty('runtime')
      if (event.payload.schema === 'wholeloop/delivery-runner-event@1' && event.payload.provenance)
        expect(activity.provenance).toBe(event.payload.provenance)
    }
  },
)
it('distinguishes committed progress from claims, process starts and actor declarations', () => {
  const fixture = JSON.parse(
      readFileSync('test/fixtures/overview/budget-boundary.json', 'utf8'),
    ) as { journals: { delivery: DeliveryEvent[] } },
    prior = fixture.journals.delivery.at(-1)
  if (!prior) throw new Error('Budget fixture history required')
  const progress = deliveryEvent(
    prior.run,
    { kind: 'controller', name: 'PRIVATE_ACTOR_NAME' },
    {
      schema: 'wholeloop/delivery-budget-event@1',
      basis: 'a'.repeat(64),
      action: 'progress',
      progress: {
        key: 'fixture-progress',
        kind: 'validated-artifact',
        digest: 'b'.repeat(64),
        evidence: 'c'.repeat(64),
        provenance: 'fixture',
      },
    },
    prior,
    at,
  )
  replayDelivery([...fixture.journals.delivery, progress])
  expect(deliveryActivity(progress)).toMatchObject({ progress: true, provenance: 'fixture' })
  expect(JSON.stringify(deliveryActivity(progress))).not.toContain('PRIVATE_')
  const completed = event(
    'init-00000001',
    {
      type: 'step.completed',
      data: {
        step: 'write-spec',
        run: 'run-0123456789abcdef',
        artifact: {
          path: 'items/init-00000001/artifacts/write-spec/run-0123456789abcdef.md',
          content: 'PRIVATE_ARTIFACT_CONTENT',
        },
      },
    },
    at,
    {
      actor: {
        kind: 'agent',
        name: 'PRIVATE_ACTOR_NAME',
        client: { client: 'codex', model: 'declared-fixture-model', source: 'declared' },
      },
    },
  )
  expect(stateActivity(completed, 0)).toMatchObject({
    progress: true,
    provenance: 'declared',
    actor: 'agent',
  })
  expect(JSON.stringify(stateActivity(completed, 0))).not.toContain('PRIVATE_')
  expect(
    stateActivity(
      {
        ...completed,
        type: 'step.skipped',
        data: { step: 'write-spec', run: 'run-0123456789abcdef', reason: 'PRIVATE_REASON' },
      },
      0,
    ),
  ).toMatchObject({ progress: false })
})
