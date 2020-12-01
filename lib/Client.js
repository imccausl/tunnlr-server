import http from 'http'

import debug from 'debug'

const log = debug('tunnlr:client')

class Client {
  constructor(options) {
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

export default Client
