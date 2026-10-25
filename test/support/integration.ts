import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeliveryAcceptance } from '../../src/acceptance/store.js'
import { EnvironmentRecipes } from '../../src/environment/recipe-store.js'
import type { IntegrationRequest } from '../../src/integration/contracts.js'
import { IntegrationCandidates } from '../../src/integration/store.js'
import { fixture, git } from './delivery.js'
import { environmentRecipe } from './environment.js'

export async function integrationFixture(
  run: (context: {
    store: IntegrationCandidates
    request: IntegrationRequest
    root: string
    dir: string
    paths: { contract: string; search: string; assembly: string }
  }) => Promise<void>,
  options: { secondRepository?: boolean; remote?: boolean; retain?: boolean } = {},
) {
  await fixture(
    async ({ planning, plan, root, dir }) => {
      const code = "require('node:http').createServer((_q,r)=>r.end('{}')).listen(3000,'0.0.0.0')\n"
      writeFileSync(join(root, 'app.cjs'), code)
      git(root, ['add', '.'])
      git(root, [
        'commit',
        '-m',
        'test: seed an integration application',
        '-m',
        'Provide committed entrypoints for exact candidate preparation.',
      ])
      const repository = plan.repositories[0]
      if (!repository) throw new Error('No fixture repository')
      repository.base = git(root, ['rev-parse', 'HEAD'])
      let searchRoot = root
      if (options.remote) {
        git(root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
        repository.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
      }
      if (options.secondRepository) {
        searchRoot = join(dir, 'repo-web')
        mkdirSync(searchRoot)
        git(searchRoot, ['init', '-b', 'main'])
        git(searchRoot, ['config', 'user.name', 'Fixture Owner'])
        git(searchRoot, ['config', 'user.email', 'fixture@example.test'])
        writeFileSync(join(searchRoot, 'app.cjs'), code)
        git(searchRoot, ['add', '.'])
        git(searchRoot, [
          'commit',
          '-m',
          'test: seed a second integration repository',
          '-m',
          'Bind a separate committed frontend to the shared milestone.',
        ])
        plan.repositories.push({
          id: 'web',
          root: searchRoot,
          target: 'refs/heads/main',
          base: git(searchRoot, ['rev-parse', 'HEAD']),
        })
        const unit = plan.work.find((unit) => unit.id === 'search')
        if (!unit) throw new Error('Missing search work')
        unit.repository = 'web'
      }

      const prepared = planning.preparePlan(plan)
      const paths = {
        contract: join(dir, 'contract'),
        search: join(dir, 'search'),
        assembly: join(dir, 'assembly'),
      }
      git(root, ['worktree', 'add', '-b', 'wl/contract', paths.contract, 'HEAD'])
      writeFileSync(join(paths.contract, 'contract.json'), '{"version":"v1"}\n')
      git(paths.contract, ['add', '.'])
      git(paths.contract, [
        'commit',
        '-m',
        'feat: define the title search contract',
        '-m',
        'Commit the interface before dependent implementation.',
      ])
      const contract = git(paths.contract, ['rev-parse', 'HEAD'])
      git(searchRoot, [
        'worktree',
        'add',
        '-b',
        'wl/search',
        paths.search,
        options.secondRepository ? 'HEAD' : contract,
      ])
      writeFileSync(join(paths.search, 'search.txt'), 'Search returns matching titles.\n')
      git(paths.search, ['add', '.'])
      git(paths.search, [
        'commit',
        '-m',
        'feat: implement title lookup',
        '-m',
        'Use the committed predecessor contract as the implementation basis.',
      ])
      const search = git(paths.search, ['rev-parse', 'HEAD'])
      git(root, [
        'worktree',
        'add',
        '-b',
        'wl/integration',
        paths.assembly,
        options.secondRepository ? contract : search,
      ])
      const acceptance = new DeliveryAcceptance(planning.sources.files.root).prepare({
        schema: 'wholeloop/acceptance-plan@1',
        run: plan.run,
        revision: plan.revision,
        plan: prepared.digest,
        source: plan.source,
        cases: [
          {
            id: 'find-title',
            criteria: ['search'],
            owner: 'machine',
            applicability: 'applicable',
            rationale: 'The agreed title lookup is executable.',
            initial: 'Two tasks exist.',
            actions: ['Find the requested title through the API.'],
            assertions: [
              {
                id: 'ids',
                subject: 'json',
                operator: 'equals',
                path: '/ids',
                expected: '["task-1"]',
                description: 'Return the matching identifier.',
              },
            ],
            failureConditions: ['Any missing or extra identifier fails.'],
            runner: {
              kind: 'api',
              capability: 'http.request',
              input: JSON.stringify({
                schema: 'wholeloop/behavior-input@1',
                kind: 'api',
                service: 'web',
                port: 3000,
                steps: [
                  { id: 'find', kind: 'request', method: 'GET', path: '/tasks?title=Durable' },
                ],
              }),
            },
            fixture: { ref: 'fixture:integration-search', sha256: 'c'.repeat(64) },
            timeoutMs: 30000,
          },
        ],
        retention: { reviewAfterMs: 60000, expiryAction: 'retain' },
      })
      const recipe = new EnvironmentRecipes(planning.sources.files.root).prepare(
        environmentRecipe(paths.assembly, code),
      )
      const files = planning.sources.files
      const asset = (id: string, text: string) => {
        const ref = `delivery/integration-inputs/${id}.txt`
        files.atomic(ref, text)
        return {
          ref,
          sha256: createHash('sha256')
            .update(readFileSync(files.path(ref)))
            .digest('hex'),
        }
      }
      const data = asset('db', '[]\n'),
        verify = asset('verify', 'Pinned verification policy fixture.\n'),
        review = asset('review', 'Pinned review rubric fixture.\n')
      const request: IntegrationRequest = {
        schema: 'wholeloop/integration-candidate-request@1',
        run: plan.run,
        revision: plan.revision,
        plan: prepared.digest,
        milestone: 'feature',
        strategy: 'ordered-merge',
        parts: [
          {
            work: 'contract',
            repository: 'app',
            path: paths.contract,
            ref: 'refs/heads/wl/contract',
            head: contract,
          },
          {
            work: 'search',
            repository: 'app',
            path: paths.search,
            ref: 'refs/heads/wl/search',
            head: search,
          },
        ],
        assemblies: [
          {
            repository: 'app',
            path: paths.assembly,
            ref: 'refs/heads/wl/integration',
            base: repository.base,
            head: search,
          },
        ],
        contracts: plan.work.flatMap((unit) =>
          unit.produces.map(({ id, revision, sha256 }) => ({ id, revision, sha256 })),
        ),
        inputs: [
          {
            id: 'acceptance',
            kind: 'acceptance',
            ref: acceptance.digest,
            sha256: acceptance.digest,
            after: ['recipe', 'db'],
          },
          { id: 'recipe', kind: 'recipe', ref: recipe.digest, sha256: recipe.digest, after: [] },
          { id: 'db', kind: 'data', ...data, after: [] },
          {
            id: 'verify',
            kind: 'gate-policy',
            repository: 'app',
            gate: 'verify',
            ...verify,
            after: ['recipe'],
          },
          {
            id: 'review',
            kind: 'gate-policy',
            repository: 'app',
            gate: 'review',
            ...review,
            after: ['recipe'],
          },
        ],
        repairOwners: [{ criterion: 'search', kind: 'work', id: 'search' }],
      }
      if (options.secondRepository) {
        const webAssembly = join(dir, 'assembly-web')
        git(searchRoot, ['worktree', 'add', '-b', 'wl/integration-web', webAssembly, search])
        const part = request.parts.find((part) => part.work === 'search')
        if (!part) throw new Error('Missing search part')
        part.repository = 'web'
        request.assemblies[0] = {
          repository: 'app',
          path: paths.assembly,
          ref: 'refs/heads/wl/integration',
          base: repository.base,
          head: contract,
        }
        const web = plan.repositories.find((repo) => repo.id === 'web')
        if (!web) throw new Error('Missing web repository')
        request.assemblies.push({
          repository: 'web',
          path: webAssembly,
          ref: 'refs/heads/wl/integration-web',
          base: web.base,
          head: search,
        })
        const definition = environmentRecipe(webAssembly, code)
        const selected = definition.repositories[0]
        if (!selected) throw new Error('Missing recipe repository')
        selected.id = 'web'
        for (const file of definition.files) file.repository = 'web'
        for (const service of definition.services) {
          for (const mount of service.mounts)
            if (mount.kind === 'workspace') {
              mount.source = 'web'
              mount.target = '/workspace/web'
            }
          service.start.argv = service.start.argv.map((value) =>
            value.replace('/workspace/app', '/workspace/web'),
          )
          service.start.cwd = '/workspace/web'
        }
        const webRecipe = new EnvironmentRecipes(files.root).prepare(definition)
        request.inputs.push({
          id: 'recipe-web',
          kind: 'recipe',
          ref: webRecipe.digest,
          sha256: webRecipe.digest,
          after: [],
        })
        const accepting = request.inputs.find((item) => item.kind === 'acceptance')
        accepting?.after.push('recipe-web')
        for (const gate of ['verify', 'review'] as const) {
          const value = asset(`${gate}-web`, `${gate} requirement for the separate frontend.\n`)
          request.inputs.push({
            id: `${gate}-web`,
            kind: 'gate-policy',
            repository: 'web',
            gate,
            ...value,
            after: ['recipe-web'],
          })
        }
      }
      await run({ store: new IntegrationCandidates(files.root), request, root, dir, paths })
    },
    { retain: options.retain ?? false },
  )
}
