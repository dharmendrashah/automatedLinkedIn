import { describe, expect, it, vi } from 'vitest'

import { deadDepths } from './deadQueue'
import { type ConsumerDefinition } from './defineConsumer'
import { replayDead } from './replay'

const definition = {
   name: 'results',
   queue: 'tasks.done',
   topology: vi.fn().mockResolvedValue(undefined),
} as unknown as ConsumerDefinition

const dead = (id: string) => ({
   content: Buffer.from(id),
   properties: {
      contentType: 'application/json',
      messageId: id,
      headers: {
         'x-retries': 3,
         'x-failure': 'database is down',
         'x-other': 'kept',
      },
   },
})

const channelWith = (messages: Array<ReturnType<typeof dead>>) => {
   const queue = [...messages]

   return {
      assertQueue: vi.fn().mockResolvedValue(undefined),
      checkQueue: vi.fn().mockResolvedValue({ messageCount: messages.length }),
      get: vi.fn(async () => queue.shift() ?? false),
      sendToQueue: vi.fn().mockReturnValue(true),
      waitForConfirms: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
   }
}

describe('replayDead', () => {
   it('should move every dead message back to its queue, with the retry count and the reason cleared', async () => {
      const first = dead('a')
      const channel = channelWith([first, dead('b')])

      await expect(replayDead(channel as never, definition)).resolves.toBe(2)

      expect(channel.sendToQueue).toHaveBeenCalledWith(
         'tasks.done',
         first.content,
         expect.objectContaining({ headers: { 'x-other': 'kept' } })
      )
      expect(channel.ack).toHaveBeenCalledTimes(2)
      expect(channel.get).toHaveBeenCalledWith('tasks.done.dead', { noAck: false })
   })

   it('should stop when the queue runs empty early', async () => {
      const channel = channelWith([dead('a')])

      channel.checkQueue.mockResolvedValue({ messageCount: 5 })

      await expect(replayDead(channel as never, definition)).resolves.toBe(1)
   })

   it('should put a message back and report the failure when it could not be republished', async () => {
      const message = dead('a')
      const channel = channelWith([message])

      channel.waitForConfirms.mockRejectedValue(new Error('nack from broker'))

      await expect(replayDead(channel as never, definition)).rejects.toThrow('nack from broker')
      expect(channel.nack).toHaveBeenCalledWith(message, false, true)
      expect(channel.ack).not.toHaveBeenCalled()
   })
})

describe('deadDepths', () => {
   it('should count the messages of each dead queue and close its channel', async () => {
      const channel = {
         checkQueue: vi.fn(async (queue: string) => ({ messageCount: queue === 'a.dead' ? 2 : 0 })),
         close: vi.fn().mockResolvedValue(undefined),
      }

      await expect(deadDepths(['a', 'b'], async () => channel as never)).resolves.toEqual([
         {
            queue: 'a.dead',
            messages: 2,
         },
         {
            queue: 'b.dead',
            messages: 0,
         },
      ])
      expect(channel.close).toHaveBeenCalled()
   })

   it('should close the channel and fail when a queue does not exist', async () => {
      const channel = {
         checkQueue: vi.fn().mockRejectedValue(new Error('NOT_FOUND')),
         close: vi.fn().mockResolvedValue(undefined),
      }

      await expect(deadDepths(['a'], async () => channel as never)).rejects.toThrow('NOT_FOUND')
      expect(channel.close).toHaveBeenCalled()
   })
})
