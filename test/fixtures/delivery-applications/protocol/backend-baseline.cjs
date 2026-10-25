const http = require('node:http'),
  assert = require('node:assert/strict')
const payload = { results: ['task-1'] }
if (process.argv.includes('--unit')) {
  assert.equal(Object.values(payload)[0][0], 'task-1')
  console.log('backend unit passed')
} else {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(payload))
  })
  server.listen(
    Number(process.argv[process.argv.indexOf('--port') + 1]) || 0,
    process.argv.includes('--host')
      ? process.argv[process.argv.indexOf('--host') + 1]
      : '127.0.0.1',
    () => console.log(JSON.stringify({ port: server.address().port })),
  )
}
