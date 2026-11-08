import 'dotenv/config'

import '../aliases'

import { MessageBroker } from 'core'
import { log } from 'core/log'

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

      log.info('Moved messages back from the dead-letter queue', {
         moved,
         queue: consumer.queue,
      })
   } finally {
      await channel.close().catch(() => undefined)
   }
}

run()
   .catch((error: unknown) => {
      log.error('Replay failed', { error })
      process.exitCode = 1
   })
   .finally(() => Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()]))
