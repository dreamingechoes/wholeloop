const http = require('node:http'),
  assert = require('node:assert/strict')
function render(data) {
  if (!Array.isArray(data.ids)) throw new Error('API contract mismatch')
  return { ids: data.ids }
}
if (process.argv.includes('--unit')) {
  assert.deepEqual(render({ ids: ['task-1'] }), { ids: ['task-1'] })
  console.log('frontend unit passed')
} else {
  const backend = process.argv[process.argv.indexOf('--backend') + 1]
  const server = http.createServer(async (_request, response) => {
    response.setHeader('content-type', 'application/json')
    try {
      response.end(JSON.stringify(render(await (await fetch(backend)).json())))
    } catch {
      response.statusCode = 502
      response.end(JSON.stringify({ error: 'API contract mismatch' }))
    }
  })
  server.listen(
    Number(process.argv[process.argv.indexOf('--port') + 1]) || 0,
    process.argv.includes('--host')
      ? process.argv[process.argv.indexOf('--host') + 1]
      : '127.0.0.1',
    () => console.log(JSON.stringify({ port: server.address().port })),
  )
}
