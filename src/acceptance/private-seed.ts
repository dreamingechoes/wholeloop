import { AcceptanceError } from './contracts.js'

/** ASCII framing preserves split UTF-8 and keeps worst-case JSON escaping below the fixed two-MiB pipe budget. */
export function privateSeedInput(body: string, script: string) {
  if (Buffer.byteLength(body) > 1024 * 1024 || Buffer.byteLength(script) > 256 * 1024)
    throw new AcceptanceError('private-seed-size')
  return JSON.stringify({
    'cases.json': Buffer.from(body).toString('base64'),
    'runner.mjs': Buffer.from(script).toString('base64'),
  })
}
export const PRIVATE_SEED_PROGRAM = `const fs=require('node:fs'),crypto=require('node:crypto');let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{text+=c;if(Buffer.byteLength(text)>2097152)process.exit(2)});process.stdin.on('end',()=>{const input=JSON.parse(text);if(Object.keys(input).sort().join(',')!=='cases.json,runner.mjs')process.exit(3);const files=Object.entries(input).map(([name,value])=>{if(typeof value!=='string')process.exit(3);const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value||bytes.length>(name==='cases.json'?1048576:262144))process.exit(3);return [name,bytes]});fs.chmodSync('/private',493);for(const [name,bytes] of files){fs.writeFileSync('/private/'+name,bytes,{flag:'wx',mode:292});fs.chmodSync('/private/'+name,292)}console.log(JSON.stringify({initialized:true,cases:crypto.createHash('sha256').update(fs.readFileSync('/private/cases.json')).digest('hex'),runner:crypto.createHash('sha256').update(fs.readFileSync('/private/runner.mjs')).digest('hex')}))})`
