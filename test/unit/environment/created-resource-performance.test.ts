import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { DockerResources } from '../../../src/environment/docker-resources.js'
import { EnvironmentResources, type EnvironmentRuntime } from '../../../src/environment/runtime.js'
import { StoreFiles } from '../../../src/state/files.js'

const ID = `environment-${'a'.repeat(32)}`

/** A daemon that answers inspections from the labels and options of each creation. */
async function setup(
  run: (input: {
    owned: DockerResources
    calls: string[][]
    objects: Map<string, Record<string, unknown>>
  }) => Promise<void>,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-created-resource-')))
  try {
    const records = new EnvironmentResources(new StoreFiles(root)),
      now = new Date(Date.now() - 1000).toISOString(),
      calls: string[][] = [],
      objects = new Map<string, Record<string, unknown>>()
    records.create({
      schema: 'wholeloop/environment-runtime@1',
      id: ID,
      run: `delivery-${'a'.repeat(16)}`,
      basis: 'b'.repeat(64),
      recipe: 'c'.repeat(64),
      key: 'created',
      grant: `authorization-${'d'.repeat(16)}`,
      grantDigest: 'e'.repeat(64),
      token: 'fixture-owner',
      effect: `effect-${'f'.repeat(32)}`,
      createdAt: now,
      deadline: new Date(Date.now() + 60000).toISOString(),
      lifetimeDeadline: new Date(Date.now() + 120000).toISOString(),
      state: 'ready',
      provenance: 'fixture',
      helperImage: DOCKER_REFERENCE_HELPER,
      host: { os: 'fixture', architecture: 'arm64' },
      candidates: [],
      resources: [],
      observations: [],
      acceptance: 'not-established',
      publication: 'not-performed',
    } as EnvironmentRuntime)
    const respond = (value: unknown) => ({
      status: 'succeeded' as const,
      stdout: typeof value === 'string' ? `${value}\n` : JSON.stringify(value),
      code: 0,
      digest: contractDigest(value),
    })
    const driver: DockerTransport = {
      provenance: 'fixture',
      call: async (args) => {
        calls.push(args)
        if (args[1] === 'create') {
          const name = args.at(-1) ?? '',
            labels = Object.fromEntries(
              args.flatMap((arg, index) =>
                args[index - 1] === '--label' ? [arg.split(/=(.*)/s).slice(0, 2)] : [],
              ),
            ),
            id = args[0] === 'volume' ? name : contractDigest({ name })
          objects.set(id, {
            ...(args[0] === 'volume'
              ? { Name: name, Driver: 'local', Options: null, Mountpoint: `/fixture/${name}` }
              : {
                  Id: id,
                  Name: name,
                  Driver: 'bridge',
                  Internal: args.includes('--internal'),
                  Options: Object.fromEntries(
                    args.flatMap((arg, index) =>
                      args[index - 1] === '--opt' ? [arg.split(/=(.*)/s).slice(0, 2)] : [],
                    ),
                  ),
                  Created: new Date().toISOString(),
                }),
            Labels: labels,
            CreatedAt: new Date().toISOString(),
          })
          return respond(id)
        }
        if (args[1] === 'inspect') return respond(args.slice(2).map((key) => objects.get(key)))
        throw new Error('Unexpected fixture Docker command')
      },
    }
    await run({
      owned: new DockerResources(records, ID, driver, () => {}, new AbortController().signal),
      calls,
      objects,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('created Docker resources (ADR-0244)', () => {
  it('inspects a created volume and network once each after creation', async () => {
    await setup(async ({ owned, calls }) => {
      const volume = await owned.volume('data', 'data'),
        network = await owned.network()
      expect(calls.map((args) => args.slice(0, 2).join(' '))).toEqual([
        'volume create',
        'volume inspect',
        'network create',
        'network inspect',
      ])
      expect([volume.status, network.status]).toEqual(['observed', 'observed'])
      expect(volume.stamp).toMatch(/^[a-f0-9]{64}$/)
      // A later effect boundary still inspects the resource again.
      await owned.owned(volume)
      expect(calls).toHaveLength(5)
    })
  })

  it('binds the created identity before refusing a policy violation in that response', async () => {
    await setup(async ({ owned, calls, objects }) => {
      const original = owned.driver.call.bind(owned.driver)
      owned.driver.call = async (args, options) => {
        const result = await original(args, options)
        if (args[1] === 'create') {
          const created = objects.get(result.stdout.trim())
          if (created) created.Driver = 'foreign'
        }
        return result
      }
      await expect(owned.volume('data', 'data')).rejects.toThrow('volume-policy-changed')
      expect(calls.filter((args) => args[1] === 'create')).toHaveLength(1)
      const entry = owned.records
        .get(ID)
        .record.resources.find((resource) => resource.slot === 'data')
      expect(entry?.status).toBe('observed')
      expect(entry?.id).toBe(entry?.name)
    })
  })
})
