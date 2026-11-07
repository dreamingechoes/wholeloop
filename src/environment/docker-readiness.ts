// The TCP readiness probe run against an owned service.
// Fixed controller code observes the owned service network without application hooks.
export const TCP_READY = `const net=require('node:net');let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{const {port}=JSON.parse(text);const s=net.connect({host:'127.0.0.1',port});const t=setTimeout(()=>{s.destroy();process.exit(2)},500);s.on('connect',()=>{clearTimeout(t);s.end();console.log('ready')});s.on('error',()=>{clearTimeout(t);process.exit(1)})})`
