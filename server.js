/* eslint-disable max-classes-per-file */
import http from 'http'
import https from 'https'
import Koa from 'koa'
import logger from 'koa-logger'
import { customAlphabet } from 'nanoid/non-secure'
import tldjs from 'tldjs'
import debug from 'debug'

import TunnlrAgent from './lib/TunnlrAgent.js'
import Client from './lib/Client.js'

const connections = new Map()
const nanoid = customAlphabet(
  '1234567890abcdefghijklmnopqrstuvwxyz',
  10,
)

const log = debug('tunnlr')

const startServer = async () => {
  const agent = new TunnlrAgent()
  const client = new Client({
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
