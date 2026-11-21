import { once } from 'node:events'
import { createServer, request as send } from 'node:http'
import { type AddressInfo, connect, type Socket } from 'node:net'
import { publicLookup, publicUrl } from '@/services/agent-tools/public-web.js'

export async function startBrowserProxy() {
  const sockets = new Set<Socket>()
  const server = createServer((request, response) => {
    try {
      const url = publicUrl(request.url ?? '')
      if (url.protocol !== 'http:' || request.method !== 'GET') {
        response.writeHead(403).end()
        return
      }
      const upstream = send(
        url,
        {
          lookup: publicLookup,
          headers: {
            accept: request.headers.accept ?? '*/*',
            'user-agent': request.headers['user-agent'] ?? 'Chrome',
          },
          timeout: 15000,
        },
        (reply) => {
          response.writeHead(reply.statusCode ?? 502, reply.headers)
          reply.pipe(response)
        },
      )
      response.once('close', () => upstream.destroy())
      upstream.on('timeout', () => upstream.destroy())
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502)
        response.end()
      })
      upstream.end()
    } catch {
      response.writeHead(403).end()
    }
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('error', () => socket.destroy())
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('connect', (request, socket, head) => {
    try {
      const authority = request.url ?? ''
      if (!/^(?:\[[a-f\d:]+\]|[\w.-]+):(443|80)$/i.test(authority))
        throw new Error('Invalid destination')
      const url = publicUrl(`https://${authority}`)
      const upstream = connect({
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: Number(url.port || 443),
        lookup: publicLookup,
      })
      socket.once('close', () => upstream.destroy())
      upstream.on('error', () => socket.destroy())
      upstream.once('close', () => socket.destroy())
      upstream.setTimeout(30000, () => upstream.destroy())
      upstream.once('connect', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      })
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close() {
      server.close()
      for (const socket of sockets) socket.destroy()
    },
  }
}
