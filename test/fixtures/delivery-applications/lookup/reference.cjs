const http = require('node:http')
const tasks = [
  { id: 'task-1', title: 'Release Notes' },
  { id: 'task-2', title: 'Café Review' },
]
function find(title) {
  if (!title.trim()) throw new Error('title required')
  return {
    ids: tasks
      .filter((task) => task.title.toLowerCase().includes(title.toLowerCase()))
      .map((task) => task.id),
  }
}
if (process.argv.includes('--query')) {
  try {
    console.log(JSON.stringify(find(process.argv[process.argv.indexOf('--query') + 1] || '')))
  } catch {
    console.error('title required')
    process.exitCode = 7
  }
} else if (process.argv.includes('--unit')) {
  require('node:assert/strict').deepEqual(find('notes'), { ids: ['task-1'] })
  console.log('unit passed')
} else {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    try {
      response.end(
        JSON.stringify(find(new URL(request.url, 'http://owned').searchParams.get('title') || '')),
      )
    } catch {
      response.statusCode = 400
      response.end(JSON.stringify({ error: 'title required' }))
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
