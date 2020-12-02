/* eslint-disable max-classes-per-file */
import net from 'net'
import { EventEmitter } from 'events'

import fetch from 'node-fetch'
import { createBrotliCompress } from 'zlib'

const MAX_CONNECTIONS = 10
const LOCAL_TUNNEL_PORT = process.env.PORT || 3000
const TUNNEL_SERVER_HOSTNAME = 'localhost'
const TUNNEL_SERVER_PORT = 8080
const API_NEW_CLIENT = '?new'

class Tunnel extends EventEmitter {
  constructor(options) {
    super(options)

    this.tunnelServerHost = options.tunnelServerHost
    this.localHost = options.localHost
    this.localPort = options.localPort
  }

  async _init() {
    const response = await fetch(
      `http://${TUNNEL_SERVER_HOSTNAME}:${TUNNEL_SERVER_PORT}/${API_NEW_CLIENT}`,
    )
    const body = await response.json()
    console.log(body)

    this.tunnelSeverPort = body.port
    this.clientId = body.clientId

    return body.port
  }

  async open() {
    const port = await this._init()

    const remoteConnection = net.connect({
      host: this.tunnelServerHost,
      port,
    })

    remoteConnection.setKeepAlive(true)

    const createLocalConnection = () => {
      if (remoteConnection.destroyed) {
        // reopen the connection, remote connetion destroyed
        this.open()
        return
      }

      console.log('Connecting to local server...')
      remoteConnection.pause()

      const localConnection = net.connect({
        host: this.localHost,
        port: this.localPort,
      })

      const handleRemoteConnectionClose = () => {
        console.log('remote close')

        localConnection.end()
        //reopen the connection if closed.
        this.open()
      }

      remoteConnection.once('close', () => {
        console.log('remote connection closed')
        handleRemoteConnectionClose()
      })

      localConnection.once('connect', () => {
        console.log('local connection established')
        remoteConnection.resume()
        remoteConnection.pipe(localConnection).pipe(remoteConnection)
      })

      localConnection.once('close', hadError => {
        console.log('local connection closed [%s]', hadError)
      })

      localConnection.once('error', err => {
        console.log('Local connection error: ', err)
        localConnection.end()

        if (err.code !== 'ECONNREFUSED') {
          return remoteConnection.end()
        }

        // retry connection
        setTimeout(createLocalConnection, 1000)
      })
    }

    remoteConnection.on('error', err => {
      console.log('Remote connection error:', err)

      remoteConnection.end()
    })

    remoteConnection.once('connect', () => {
      console.log('remote connection established')
      createLocalConnection()
    })

    remoteConnection.on('data', data => {})
  }
}

//for (let i = 0; i < MAX_CONNECTIONS; i += 1) {
;(async () => {
  const tunnel = new Tunnel({
    tunnelServerHost: 'localhost',
    localHost: 'localhost',
    localPort: LOCAL_TUNNEL_PORT,
  })
  await tunnel.open()
})()
//}
