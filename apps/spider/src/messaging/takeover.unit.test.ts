import { describe, expect, it, vi } from 'vitest'

import { TAKEOVER_FRAME_KEY, TAKEOVER_INPUT_EXCHANGE, type TakeoverFrame } from '@automatedLinkedIn/contracts'

import { listenForInput, publishFrame } from './takeover'

const TASK_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

const frame: TakeoverFrame = {
   contract: 1,
   task_id: TASK_ID,
   seq: 1,
   width: 1280,
   height: 720,
   jpeg: '/9j/4AAQ',
   expires_at: '2026-10-15T10:10:00.000Z',
}

describe('publishFrame', () => {
   it('should send the picture to brain without keeping it, since a picture is worth nothing a moment later', async () => {
      const channel = { publish: vi.fn(() => true) }

      await publishFrame(channel, frame)

      expect(channel.publish).toHaveBeenCalledWith(
         expect.any(String),
         TAKEOVER_FRAME_KEY,
         Buffer.from(JSON.stringify(frame)),
         expect.objectContaining({ persistent: false })
      )
   })
})

describe('listenForInput', () => {
   const setup = () => {
      let deliver: ((message: { content: Buffer } | null) => void) | undefined
      const channel = {
         assertQueue: vi.fn(async (_name: string, _options: object) => ({ queue: 'amq.gen-1' })),
         bindQueue: vi.fn(async (_queue: string, _exchange: string, _key: string) => undefined),
         consume: vi.fn(async (_queue: string, handler: (message: { content: Buffer } | null) => void) => {
            deliver = handler

            return { consumerTag: 'tag-1' }
         }),
         cancel: vi.fn(async (_tag: string) => undefined),
         deleteQueue: vi.fn(async (_queue: string) => undefined),
      }

      return {
         channel,
         deliver: (body: unknown) =>
            deliver?.({ content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) }),
      }
   }

   it('should listen on a queue of its own bound to this run only, that goes away with the connection', async () => {
      const { channel } = setup()

      await listenForInput(channel, TASK_ID, vi.fn())

      expect(channel.assertQueue).toHaveBeenCalledWith(
         '',
         expect.objectContaining({
            exclusive: true,
            autoDelete: true,
         })
      )
      expect(channel.bindQueue).toHaveBeenCalledWith('amq.gen-1', TAKEOVER_INPUT_EXCHANGE, TASK_ID)
   })

   it('should hand over what matches the contract, and drop everything else without looking at it twice', async () => {
      const { channel, deliver } = setup()
      const onInput = vi.fn()

      await listenForInput(channel, TASK_ID, onInput)

      deliver({
         kind: 'click',
         x: 0.5,
         y: 0.5,
      })
      deliver({
         kind: 'evaluate',
         code: 'alert(1)',
      })
      deliver('not json')
      deliver({
         kind: 'type',
         text: '123456',
      })

      expect(onInput.mock.calls).toEqual([
         [
            {
               kind: 'click',
               x: 0.5,
               y: 0.5,
            },
         ],
         [
            {
               kind: 'type',
               text: '123456',
            },
         ],
      ])
   })

   it('should stop listening and remove its queue', async () => {
      const { channel } = setup()
      const listener = await listenForInput(channel, TASK_ID, vi.fn())

      await listener.stop()

      expect(channel.cancel).toHaveBeenCalledWith('tag-1')
      expect(channel.deleteQueue).toHaveBeenCalledWith('amq.gen-1')
   })
})
