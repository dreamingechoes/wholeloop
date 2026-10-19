import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { artifactDigest } from '../adapters/generate.js'
import { isObject } from '../config/schema.js'
import { StoreFiles } from '../state/files.js'
import { canonicalPath, storePath } from '../state/paths.js'
import { git, repository } from '../worktrees/git.js'

function localValues(root: string, scope = '--local') {
  const result = spawnSync('git', ['config', scope, '--null', '--get-all', 'core.hooksPath'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
  })
  if (result.error || (result.status !== 0 && result.status !== 1))
    throw new Error('Cannot inspect Git hook configuration')
  return result.status === 1 ? [] : result.stdout.split('\0').filter(Boolean)
}
function file(path: string) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024)
    throw new Error('Guard installation files must be bounded regular files')
  return { content: readFileSync(path, 'utf8'), mode: stat.mode & 0o777 }
}
interface Receipt {
  schema: 'wholeloop/git-guards-receipt@1'
  commonDir: string
  store: string
  previous: string[]
  files: { path: string; sha256: string; mode: number }[]
}
function receipt(files: StoreFiles, commonDir: string): Receipt {
  const value: unknown = JSON.parse(file(files.path('receipt.json')).content)
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/git-guards-receipt@1' ||
    value.commonDir !== commonDir ||
    typeof value.store !== 'string' ||
    !Array.isArray(value.previous) ||
    value.previous.some((entry) => typeof entry !== 'string') ||
    !Array.isArray(value.files) ||
    value.files.some(
      (entry) =>
        !isObject(entry) ||
        typeof entry.path !== 'string' ||
        !/^(?:wl\.mjs|run\.mjs|hooks\/[a-z][a-z-]*)$/.test(entry.path) ||
        typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        ![0o644, 0o755].includes(Number(entry.mode)),
    )
  )
    throw new Error('Invalid guard ownership receipt; preserve it for inspection')
  const record = value as unknown as Receipt
  for (const entry of record.files) {
    const current = file(files.path(entry.path))
    if (artifactDigest(current.content) !== entry.sha256 || current.mode !== entry.mode)
      throw new Error('An installed guard file changed; preserve it before repair')
  }
  if (
    !record.files.some((entry) => entry.path === 'wl.mjs') ||
    !record.files.some((entry) => entry.path === 'run.mjs') ||
    !record.files.some((entry) => entry.path === 'hooks/pre-commit') ||
    !record.files.some((entry) => entry.path === 'hooks/pre-push')
  )
    throw new Error('Incomplete guard ownership receipt')
  return record
}
function runner(core: string, store: string, original: string, hash: string) {
  return `import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const core=${JSON.stringify(core)}, store=${JSON.stringify(store)}, original=${JSON.stringify(original)}
const denied=()=>{console.error('wholeloop: guarded Git operation denied; inspect the tested plan, assigned workspace and external store.');return 1}
export async function run(name,args) {
 try {
  const stat=lstatSync(core)
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>4194304 || createHash('sha256').update(readFileSync(core)).digest('hex')!==${JSON.stringify(hash)})return denied()
  let input
  if(name==='pre-push') {
   let size=0;const chunks=[]
   const timer=setTimeout(()=>process.exit(denied()),5000)
   try {for await(const chunk of process.stdin){size+=chunk.length;if(size>2097152)return denied();chunks.push(chunk)}}finally{clearTimeout(timer)}
   input=Buffer.concat(chunks).toString('utf8')
  }
  const check=()=>{
   if(name!=='pre-commit' && name!=='pre-push')return true
   const command=['guard',name==='pre-commit'?'git-commit':'git-push','--store',store,'--repo',process.cwd(),'--json']
   let payload
   if(name==='pre-push') {
    if(args.length!==2)return false
    const updates=input.split('\\n').filter(Boolean).map(line=>{const row=line.trim().split(/\\s+/);if(row.length!==4)throw new Error('Invalid push row');return {localRef:row[0],localSha:row[1],remoteRef:row[2],remoteSha:row[3]}})
    command.push('--stdin');payload=JSON.stringify({remote:args[0],url:args[1],updates})
   }
   const result=spawnSync(process.execPath,[core,...command],{input:payload,encoding:'utf8',timeout:10000,maxBuffer:65536,shell:false})
   if(result.error || result.status!==0)return false
   const decision=JSON.parse(result.stdout)
   return decision.schema==='wholeloop/guard@1' && decision.decision==='allow'
  }
  if(!check())return denied()
  const previous=join(original,name)
  if(existsSync(previous) && statSync(previous).isFile() && (statSync(previous).mode & 0o111)) {
   const result=spawnSync(previous,args,{...(input===undefined?{stdio:'inherit'}:{input,stdio:['pipe','inherit','inherit']}),shell:false,timeout:30000})
   if(result.error || result.status!==0)return result.status || 1
  }
  return check()?0:denied()
 }catch{return denied()}
}
`
}
/** Explicit opt-in only. Existing hooks remain at their original paths and are chained, never copied. */
export function gitGuards(
  action: 'install' | 'uninstall' | 'status',
  root: string,
  core?: string,
  store = storePath(),
) {
  const repo = repository(root)
  const boundary = new StoreFiles(store)
  const control = new StoreFiles(boundary.path('git-guard-control'))
  return control.locked(() => {
    const files = new StoreFiles(boundary.path(`git-guards/${repo.key}`))
    const hooks = files.path('hooks')
    const previous = localValues(repo.path)
    const own = previous.length === 1 && previous[0] === hooks
    const exists = existsSync(files.path('receipt.json'))
    const base = { schema: 'wholeloop/git-guards@1', repository: repo.path, hooks }
    if (action === 'status') {
      if (!exists) return { ...base, status: own ? 'broken' : 'absent' }
      try {
        receipt(files, repo.commonDir)
        return { ...base, status: own ? 'installed' : 'configuration-changed' }
      } catch {
        return { ...base, status: 'changed' }
      }
    }
    if (action === 'uninstall') {
      if (!exists) {
        if (own)
          throw new Error('Guard configuration has no ownership receipt; preserve it for repair')
        return { ...base, status: 'already-absent' }
      }
      const record = receipt(files, repo.commonDir)
      if (!own)
        throw new Error('Git hook configuration changed; restore or inspect it before uninstalling')
      git(repo.path, ['config', '--local', '--unset-all', 'core.hooksPath'])
      for (const value of record.previous)
        git(repo.path, ['config', '--local', '--add', 'core.hooksPath', value])
      const retained = `${files.root}.backup-${randomUUID()}`
      renameSync(files.root, retained)
      return { ...base, status: 'uninstalled', retained }
    }
    if (!core?.startsWith('#!/usr/bin/env node\n') || Buffer.byteLength(core) > 4 * 1024 * 1024)
      throw new Error('Install guards from a bounded built wholeloop core')
    if (exists) {
      const record = receipt(files, repo.commonDir)
      if (
        !own ||
        record.store !== boundary.root ||
        record.files.find((entry) => entry.path === 'wl.mjs')?.sha256 !== artifactDigest(core)
      )
        throw new Error('Existing guards differ; inspect/uninstall them before upgrading')
      return { ...base, status: 'already-correct' }
    }
    if (existsSync(files.root) && readdirSync(files.root).length)
      throw new Error('Guard destination is nonempty without ownership; preserve it for recovery')
    const worktreeConfig = spawnSync('git', ['config', '--get', 'extensions.worktreeConfig'], {
      cwd: repo.path,
      encoding: 'utf8',
      timeout: 5000,
    })
    if (worktreeConfig.error || ![0, 1].includes(worktreeConfig.status ?? -1))
      throw new Error('Cannot inspect worktree hook overrides')
    if (worktreeConfig.stdout.trim() === 'true' && localValues(repo.path, '--worktree').length)
      throw new Error('Worktree-specific hook overrides need explicit manual chaining')
    const effective = localValues(repo.path, '--includes')
    if (
      effective.length > 1 ||
      effective.some((path) => !isAbsolute(path) || /[\0\r\n]/.test(path))
    )
      throw new Error('Relative or multi-valued effective hook paths need explicit manual chaining')
    const original = canonicalPath(
      git(repo.path, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']).trim(),
    )
    if (original === hooks)
      throw new Error('Refuse recursive hook chaining without an ownership receipt')
    const names = new Set(['pre-commit', 'pre-push'])
    if (existsSync(original) && lstatSync(original).isDirectory())
      for (const name of readdirSync(original))
        if (/^[a-z][a-z-]*$/.test(name) && lstatSync(join(original, name)).mode & 0o111)
          names.add(name)
    const content = new Map<string, string>([
      ['wl.mjs', core],
      ['run.mjs', runner(files.path('wl.mjs'), boundary.root, original, artifactDigest(core))],
    ])
    for (const name of [...names].sort())
      content.set(
        `hooks/${name}`,
        `#!/usr/bin/env node\nimport('../run.mjs').then(async ({run})=>process.exit(await run(${JSON.stringify(name)},process.argv.slice(2)))).catch(()=>process.exit(1))\n`,
      )
    const owned: Receipt['files'] = []
    for (const [path, body] of content) {
      files.atomic(path, body)
      chmodSync(files.path(path), 0o755)
      owned.push({ path, sha256: artifactDigest(body), mode: 0o755 })
    }
    files.atomic(
      'receipt.json',
      `${JSON.stringify({ schema: 'wholeloop/git-guards-receipt@1', commonDir: repo.commonDir, store: boundary.root, previous, files: owned } satisfies Receipt, null, 2)}\n`,
    )
    if (JSON.stringify(localValues(repo.path)) !== JSON.stringify(previous))
      throw new Error(
        'Git hook configuration changed during installation; preserve the prepared files',
      )
    git(repo.path, ['config', '--local', '--replace-all', 'core.hooksPath', hooks])
    return { ...base, status: 'installed' }
  })
}
