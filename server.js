/* eslint-disable max-classes-per-file */
import http from 'http'
import https from 'https'
import Koa from 'koa'
import logger from 'koa-logger'
import router from '@koa/router'
import tldjs from 'tldjs'
import debug from 'debug'

import ClientManager from './lib/ClientManager.js'
import { createGzip } from 'zlib'

const log = debug('tunnlr')

const startServer = () => {
  const clientManager = new ClientManager()
  const app = new Koa()
  const server = http.createServer()
  const appCallback = app.callback()

  app.use(async (ctx, next) => {
    if (ctx.request.path !== '/') {
      return next()
    }

    const isNewClientRequest = ctx.query.new !== undefined
    if (isNewClientRequest) {
      console.log('creating new client')
      const client = await clientManager.addClient('test')
      ctx.body = client
    }
  })

  server.on('request', (req, res) => {
    const client = clientManager.getClient('test')

    if (!client) {
      appCallback(req, res)
      return
    }

    client.handleRequest(req, res)
  })

  server.on('upgrade', (req, socket) => {
    console.log('UPGRADED')

    const client = clientManager.getClient('test')

    if (client) {
      client.handleUpgrade(req, socket)
    }

    socket.destroy()
  })

  server.on('listening', () => log('http server listening'))
  server.on('connected', () => log('http client connected'))

  return server
}

const server = startServer()

server.listen(8080)
