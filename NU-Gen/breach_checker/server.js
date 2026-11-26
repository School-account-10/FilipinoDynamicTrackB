const http = require('http')
const fs = require('fs')
const path = require('path')

const port = Number(process.env.PORT) || 3000
const siteFolder = __dirname
const secondsBeforeGivingUp = 12
const maximumTextLength = 300000
const browserName = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const hiddenFiles = ['server.js']
const startedBySystem = Number(process.env.LISTEN_FDS) >= 1
const minutesIdleBeforeExit = Number(process.env.IDLE_MINUTES) || 10
let lastRequestTime = Date.now()

const fileTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(data))
}

function sendNothing(response, statusCode) {
  response.writeHead(statusCode)
  response.end()
}

function findFile(requestPath) {
  let cleanPath
  try {
    cleanPath = decodeURIComponent(requestPath)
  } catch (error) {
    return null
  }

  if (cleanPath.includes('\0')) return null

  if (cleanPath.endsWith('/')) {
    const indexFile = path.join(siteFolder, cleanPath, 'index.html')
    if (fs.existsSync(indexFile)) return indexFile
    if (cleanPath === '/') return path.join(siteFolder, 'osint-tools.html')
    return null
  }

  const fullPath = path.join(siteFolder, cleanPath)
  if (!fullPath.startsWith(siteFolder + path.sep)) return null
  if (hiddenFiles.includes(path.basename(fullPath))) return null
  if (path.basename(fullPath).startsWith('.')) return null
  if (!fileTypes[path.extname(fullPath).toLowerCase()]) return null
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null
  return fullPath
}

async function handleCheck(request, response, address) {
  const requestSource = request.headers['sec-fetch-site']
  if (requestSource && requestSource !== 'same-origin') {
    sendNothing(response, 403)
    return
  }

  const targetAddress = address.searchParams.get('url') || ''
  if (!/^https?:\/\//i.test(targetAddress)) {
    sendJson(response, 400, { error: 'Invalid address' })
    return
  }

  let extraHeaders = {}
  try {
    extraHeaders = JSON.parse(address.searchParams.get('headers') || '{}')
  } catch (error) {
    extraHeaders = {}
  }

  try {
    const result = await fetch(targetAddress, {
      headers: { 'User-Agent': browserName, 'Accept-Language': 'en-US,en;q=0.9', ...extraHeaders },
      redirect: 'follow',
      signal: AbortSignal.timeout(secondsBeforeGivingUp * 1000)
    })
    const text = await result.text()
    sendJson(response, 200, {
      status: result.status,
      redirected: result.redirected,
      finalAddress: result.url,
      text: text.slice(0, maximumTextLength)
    })
  } catch (error) {
    sendJson(response, 200, { status: 0, redirected: false, finalAddress: '', text: '' })
  }
}

const server = http.createServer(async (request, response) => {
  lastRequestTime = Date.now()
  const hostName = request.headers.host
  if (hostName !== 'localhost:' + port && hostName !== '127.0.0.1:' + port) {
    sendNothing(response, 403)
    return
  }

  const address = new URL(request.url, 'http://localhost:' + port)

  if (address.pathname === '/ping') {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('ok')
    return
  }

  if (address.pathname === '/check') {
    await handleCheck(request, response, address)
    return
  }

  const filePath = findFile(address.pathname)
  if (!filePath) {
    sendNothing(response, 404)
    return
  }

  response.writeHead(200, { 'Content-Type': fileTypes[path.extname(filePath).toLowerCase()] })
  fs.createReadStream(filePath).pipe(response)
})

if (startedBySystem) {
  server.listen({ fd: 3 }, () => {
    console.log('Started on demand')
  })

  setInterval(() => {
    if (Date.now() - lastRequestTime > minutesIdleBeforeExit * 60000) {
      process.exit(0)
    }
  }, 10000)
} else {
  server.listen(port, '127.0.0.1', () => {
    console.log('Open http://localhost:' + port + ' in your browser')
  })
}
