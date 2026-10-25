const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http')
const data = process.argv[process.argv.indexOf('--data-dir') + 1]
if (!process.argv.includes('--data-dir') || !path.isAbsolute(data))
  throw new Error('external --data-dir required')
fs.mkdirSync(data, { recursive: true })
const tasks = []
// The baseline deliberately keeps tasks only for the current process.
const page =
  '<!doctype html><html lang="en"><head><title>Durable tasks</title></head><body><h1>Durable tasks</h1><form><label>Task title<input name="title" required></label><button>Add task</button></form><ul aria-label="Tasks"></ul><script>async function refresh(){const data=await(await fetch("/tasks")).json();document.querySelector("ul").replaceChildren(...data.tasks.map(task=>{const li=document.createElement("li");li.textContent=task.title;return li}))}document.querySelector("form").addEventListener("submit",async event=>{event.preventDefault();await fetch("/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:new FormData(event.target).get("title")})});event.target.reset();await refresh()});refresh()</script></body></html>'
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    response.setHeader('content-type', 'text/html')
    response.end(page)
    return
  }
  response.setHeader('content-type', 'application/json')
  if (request.method === 'GET') {
    response.end(JSON.stringify({ tasks }))
    return
  }
  let body = ''
  request.on('data', (bytes) => {
    body += bytes
  })
  request.on('end', () => {
    try {
      const { title } = JSON.parse(body)
      if (typeof title !== 'string' || !title.trim()) {
        response.statusCode = 400
        response.end(JSON.stringify({ error: 'title required' }))
        return
      }
      const task = { id: `task-${tasks.length + 1}`, title }
      tasks.push(task)
      response.statusCode = 201
      response.end(JSON.stringify(task))
    } catch {
      response.statusCode = 400
      response.end(JSON.stringify({ error: 'invalid request' }))
    }
  })
})
server.listen(
  Number(process.argv[process.argv.indexOf('--port') + 1]) || 0,
  process.argv.includes('--host') ? process.argv[process.argv.indexOf('--host') + 1] : '127.0.0.1',
  () => console.log(JSON.stringify({ port: server.address().port })),
)
