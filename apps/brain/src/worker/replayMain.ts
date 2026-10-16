import 'dotenv/config'

import '../aliases'

import { MessageBroker } from 'core'

import { PrismaService } from 'database'

import { CONSUMERS } from './consumers/registry'
import { replayDead } from './consumers/replay'

// node dist/src/worker/replayMain.js <consumer name>: moves what is in that consumer's dead queue back to its queue.
const [, , name] = process.argv
const consumer = CONSUMERS.find(candidate => candidate.name === name)

const run = async () => {
   if (!consumer) {
      throw new Error(`Name a consumer: ${CONSUMERS.map(candidate => candidate.name).join(', ')}`)
   }

   const channel = await MessageBroker.confirmedChannel()

   try {
      const moved = await replayDead(channel, consumer)

      console.log(`Moved ${moved} message(s) from ${consumer.queue}.dead back to ${consumer.queue}`)
   } finally {
      await channel.close().catch(() => undefined)
   }
}

run()
   .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'unknown error')
      process.exitCode = 1
   })
   .finally(() => Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()]))
