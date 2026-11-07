// A fixed controller proxy that forwards bytes to one observed owned service.
import { createConnection } from 'node:net'
import { contractDigest } from '../contracts/compatibility.js'
import { DockerEnvironmentError } from './docker-command.js'
import { type ContainerSpec, DOCKER_HELPER_CPUS, DOCKER_PROXY_MEMORY_MIB } from './docker-policy.js'
import type { DockerResources } from './docker-resources.js'
import type { EnvironmentResource } from './runtime.js'

// A fixed controller program forwards bytes to one observed owned service. Application code
// stays on the isolated network and cannot select another destination through this listener.
export const DOCKER_PROXY = `const net=require('node:net'),c=JSON.parse(process.argv[1]);if(!/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(c.host)||!Number.isInteger(c.port)||c.port<1||c.port>65535||!Number.isFinite(c.deadline))process.exit(2);let active=0;const sockets=new Set();const server=net.createServer(client=>{if(active>=8){client.destroy();return}active++;const remote=net.connect({host:c.host,port:c.port});let bytes=0,closed=false;const close=()=>{if(closed)return;closed=true;active--;sockets.delete(client);sockets.delete(remote);client.destroy();remote.destroy()};for(const s of [client,remote]){sockets.add(s);s.setTimeout(30000,close);s.on('error',close);s.on('close',close);s.on('data',chunk=>{bytes+=chunk.length;if(bytes>4194304)close()})}client.pipe(remote);remote.pipe(client)});server.maxConnections=8;server.listen(c.port,'0.0.0.0');const stop=()=>{server.close();for(const s of sockets)s.destroy();process.exit(0)};setTimeout(stop,Math.max(1,Math.min(2147483647,c.deadline-Date.now())));process.on('SIGTERM',stop)`

export async function publishDockerService(input: {
  runtime: DockerResources
  service: EnvironmentResource
  port: number
  internal: EnvironmentResource
  ingress: EnvironmentResource
  helper: ContainerSpec['image']
  deadline: string
}) {
  const value = await input.runtime.owned(input.service)
  const networks = (
    value.NetworkSettings as {
      Networks?: Record<string, { NetworkID?: unknown; IPAddress?: unknown }>
    }
  ).Networks
  const observed = networks?.[input.internal.name]
  if (
    !observed ||
    observed.NetworkID !== input.internal.id ||
    typeof observed.IPAddress !== 'string' ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(observed.IPAddress) ||
    (value.State as { Running?: unknown }).Running !== true
  )
    throw new DockerEnvironmentError('proxy-target-unobserved')
  const command = {
    argv: [
      'node',
      '-e',
      DOCKER_PROXY,
      JSON.stringify({
        host: observed.IPAddress,
        port: input.port,
        deadline: Date.parse(input.deadline),
      }),
    ],
    cwd: '/tmp',
    origin: { kind: 'recipe' } as const,
  }
  const resource = await input.runtime.container(
    `proxy-${input.service.service}-${input.port}`,
    'proxy',
    {
      image: input.helper,
      command,
      mounts: [],
      network: input.ingress.name,
      networks: [input.internal.name],
      ports: [input.port],
      user: '65532:65532',
      memoryMiB: DOCKER_PROXY_MEMORY_MIB,
      cpus: DOCKER_HELPER_CPUS,
    },
    input.service.service,
  )
  const proxy = await input.runtime.start(resource)
  const published = proxy.ports?.find((port) => port.container === input.port)
  if (!published) throw new DockerEnvironmentError('published-port-unobserved')
  let listening = false
  for (let round = 0; round < 5 && !listening; round++) {
    input.runtime.current()
    await input.runtime.owned(proxy)
    listening = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port: published.host })
      const finish = (value: boolean) => {
        socket.destroy()
        resolve(value)
      }
      socket.setTimeout(300, () => finish(false))
      socket.once('connect', () => finish(true))
      socket.once('error', () => finish(false))
    })
    if (!listening) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!listening) throw new DockerEnvironmentError('published-port-not-ready')
  await input.runtime.owned(input.service)
  input.runtime.observation(
    'proxy-binding',
    'observed',
    contractDigest({
      service: input.service.id,
      port: input.port,
      host: observed.IPAddress,
      proxy: proxy.id,
    }),
    proxy.slot,
  )
  return proxy
}
