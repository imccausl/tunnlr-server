import { Agent } from 'http'
import net from 'net'

import debug from 'debug'

const DEFAULT_MAX_FREE_SOCKETS = 10

const log = debug('tunnlr:agent')

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

    this.tunnel = net.createServer()

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

  listen() {
    return new Promise(resolve => {
      this.tunnel.listen(() => {
        const { port } = this.tunnel.address()

        resolve({
          port,
        })
      })
    })
  }

  destroy() {
    this.tunnel.close()
    super.destroy()
  }
}

export default TunnlrAgent
