/* eslint-disable max-classes-per-file */
import http, { Agent } from 'http'
import https from 'https'
import Koa from 'koa'
import net from 'net'
import logger from 'koa-logger'
import { customAlphabet } from 'nanoid/non-secure'
import tldjs from 'tldjs'
import { unzip } from 'zlib'
import { EventEmitter } from 'events'
import debug from 'debug'

const connections = new Map()
const nanoid = customAlphabet(
  '1234567890abcdefghijklmnopqrstuvwxyz',
  10,
)

const log = debug('tunnlr')
const DEFAULT_MAX_FREE_SOCKETS = 10

class ClientConnector extends EventEmitter {
  constructor(options) {
    super(options)

    this.agent = options.agent
  }

  handleRequest(req, res) {
    log(`[INCOMING REQUEST] ${req.method} ${req.url}`)

    const clientRequest = http.request(
      {
        path: req.url,
        method: req.method,
        headers: req.headers,
        agent: this.agent,
      },
      clientRes => {
        log('server response from tunnel')
        res.writeHead(clientRes.statusCode, clientRes.headers)
        clientRes.pipe(res)
      },
    )

    clientRequest.on('error', err =>
      console.error('Error with clientRequest: ', err),
    )

    req.pipe(clientRequest)
  }

  handleUpgrade(req, socket) {
    socket.once('error', err => {
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        return
      }
      console.error('ERROR:', err)
    })

    this.agent.createConnection({}, (err, conn) => {
      console.log('creating connection to handle upgrade: ', req.url)
      // any errors getting a connection mean we cannot service this request
      if (err) {
        socket.end()
        return
      }

      // socket may have disconnected while we waiting for a socket
      if (!socket.readable || !socket.writable) {
        conn.destroy()
        socket.end()
        return
      }

      const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
      for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
        arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      }

      const headers = arr.join('\r\n')

      console.log('Headers:\n', headers)

      arr.push('')
      arr.push('')

      conn.pipe(socket).pipe(conn)
      conn.write(headers)
    })
  }
}
class TunnlrAgent extends Agent {
  constructor(options) {
    super({
      keepAlive: true,
      maxFreeSockets: 1,
    })

    this.availableSockets = []
    this.pendingConnections = []
    this.connectedSockets = 0
    this.maxTcpSockets =
      options?.maxTcpSockets || DEFAULT_MAX_FREE_SOCKETS

    this.tunnel = net.createServer().listen(7777)

    this.tunnel.on('listening', () => log('tunnel server listening'))

    this.tunnel.on('connection', socket => {
      log('tunnel connection established')

      if (this.connectedSockets >= this.maxTcpSockets) {
        console.log('max free sockets reached')
        socket.destroy()
        return
      }

      socket.once('close', hadError => {
        console.log('closed socket (error: %s)', hadError)
        this.connectedSockets -= 1
        // remove the socket from available list
        const idx = this.availableSockets.indexOf(socket)
        console.log('closed socket index: ', idx)
        if (idx >= 0) {
          this.availableSockets.splice(idx, 1)
        }

        console.log('connected sockets: %s', this.connectedSockets)
        if (this.connectedSockets <= 0) {
          console.log('all sockets disconnected')
        }
      })

      this.connectedSockets += 1
      // check for pending connections
      const pendingConnectionCallback = this.pendingConnections.shift()
      if (pendingConnectionCallback) {
        setTimeout(() => {
          pendingConnectionCallback(null, socket)
        }, 0)

        return
      }

      // if there are no pending connections in the queue,
      // make this socket available for connections
      this.availableSockets.push(socket)
    })

    this.tunnel.on('error', err => {
      console.log(
        'an error with the tunnel connection occurred, serverside:',
        err,
      )
    })
  }

  createConnection(options, cb) {
    const socket = this.availableSockets.shift()

    if (!socket) {
      log('no available sockets. queuing connection')
      this.pendingConnections.push(cb)
      return
    }

    cb(null, socket)
  }

  destroy() {
    this.tunnel.close()
    super.destroy()
  }
}

const startServer = () => {
  const agent = new TunnlrAgent()
  const client = new ClientConnector({
    agent,
  })

  const server = http.createServer()

  server.on('request', (req, res) => {
    client.handleRequest(req, res)
  })

  server.on('upgrade', (req, res) => {
    console.log('UPGRADED')
    client.handleUpgrade(req, res)
  })

  server.on('listening', () => log('http server listening'))
  server.on('connected', () => log('http client connected'))

  return server
}

const server = startServer()

server.listen(8080)
