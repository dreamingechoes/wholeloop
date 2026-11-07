// The wrapper program for one interactive Docker operation.
// The first private line selects one registered native operation. Remaining bytes
// are protocol traffic, never shell arguments; only this live wrapper signals its group.
export const DOCKER_INTERACTIVE_WRAPPER = `
import { spawn } from 'node:child_process'
import { existsSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
let bootstrap=Buffer.alloc(0),child,request,stopping=false,reason,watch,timer,failed=false
const atomic=(path,value)=>{const temporary=path+'.'+process.pid+'.tmp',fd=openSync(temporary,'wx',384);try{writeFileSync(fd,JSON.stringify(value)+'\\n');fsyncSync(fd)}finally{closeSync(fd)}renameSync(temporary,path);const dir=openSync(dirname(path),'r');try{fsyncSync(dir)}finally{closeSync(dir)}}
const outcome=(code,signal,why)=>atomic(request.outcome,{schema:'wholeloop/environment-operation-outcome@1',operation:request.operation,nonce:request.nonce,pid:process.pid,...(code!==null?{code}:{}),...(signal?{signal}:{}),reason:why,at:new Date().toISOString()})
const stop=why=>{if(stopping)return;stopping=true;reason=why;try{child?.kill('SIGTERM')}catch{}setTimeout(()=>{try{process.kill(-process.pid,'SIGKILL')}catch{process.exit(1)}},300)}
const first=setTimeout(()=>process.exit(2),5000)
process.on('SIGTERM',()=>stop('cancelled'));process.on('SIGINT',()=>stop('cancelled'))
process.stdin.on('data',bytes=>{
 if(!request){bootstrap=Buffer.concat([bootstrap,bytes]);if(bootstrap.length>65536)process.exit(2);const index=bootstrap.indexOf(10);if(index<0)return;request=JSON.parse(bootstrap.subarray(0,index).toString('utf8'));clearTimeout(first);if(existsSync(request.cancel)){outcome(null,null,'not-started');process.exit(2)}
 child=spawn(request.command,request.args,{shell:false,stdio:['pipe','pipe','pipe'],env:process.env});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.stdin.on('error',()=>{});child.once('error',()=>{failed=true;clearInterval(watch);clearTimeout(timer);outcome(null,null,'launch-failed');process.exitCode=1});child.once('close',(code,signal)=>{clearInterval(watch);clearTimeout(timer);if(failed)return;outcome(code,signal,stopping?reason:'finished');if(!stopping)process.exitCode=code===0&&!signal?0:1});watch=setInterval(()=>{if(existsSync(request.cancel))stop('cancelled')},50);timer=setTimeout(()=>stop('timeout'),request.timeoutMs);const pending=bootstrap.subarray(index+1);bootstrap=Buffer.alloc(0);if(pending.length&&!child.stdin.write(pending)){process.stdin.pause();child.stdin.once('drain',()=>process.stdin.resume())}
 }else if(!child.stdin.write(bytes)){process.stdin.pause();child.stdin.once('drain',()=>process.stdin.resume())}
});process.stdin.on('end',()=>{if(!request){clearTimeout(first);process.exitCode=2}else child?.stdin.end()})
`
