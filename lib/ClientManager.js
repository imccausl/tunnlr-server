import { customAlphabet } from 'nanoid/non-secure'

import Client from './Client.js'
import TunnlrAgent from './TunnlrAgent.js'

const nanoid = customAlphabet(
  '1234567890abcdefghijklmnopqrstuvwxyz',
  15,
)

function generateUniqueClientId(activeClients) {
  let clientIdCandidate = null

  do {
    clientIdCandidate = nanoid()
  } while (activeClients.has(clientIdCandidate))

  return clientIdCandidate
}

class ClientManager {
  constructor() {
    this.activeClients = new Map()
  }

  async addClient(
    clientId = generateUniqueClientId(this.activeClients),
  ) {
    const agent = new TunnlrAgent()
    const client = new Client({
      clientId,
      agent,
    })

    this.activeClients.set(clientId, client)

    try {
      const { port } = await agent.listen()
      return {
        port,
        clientId,
      }
    } catch (err) {
      this.removeClient(clientId)
      throw err
    }
  }

  getClient(clientId) {
    return this.activeClients.get(clientId)
  }

  removeClient(clientId) {
    this.activeClients.delete(clientId)
  }

  get activeClientCount() {
    return this.activeClients.size
  }
}

export default ClientManager
