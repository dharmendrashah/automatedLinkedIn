import { describe, expect, it, vi } from 'vitest'

import { type UniboxConversation } from './types'

import { waitForStored } from './afterSent'

const conversation = (count: number, shown = count): UniboxConversation => ({
   id: 'c1',
   accountId: 'a1',
   contact: { name: 'Ada' },
   participants: [],
   kind: 'DIRECT',
   unread: false,
   complete: true,
   messageCount: count,
   messages: Array.from({ length: shown }, (_, index) => ({
      id: `m${index}`,
      direction: 'THEM' as const,
      sender: 'Ada',
      at: index,
      when: '',
      text: 'x',
      attachments: [],
   })),
})

const wait = vi.fn(async (_ms: number) => undefined)

describe('waitForStored', () => {
   it('should read the conversation again until it holds more messages than before, and give that conversation', async () => {
      const open = vi
         .fn()
         .mockResolvedValueOnce(conversation(3))
         .mockResolvedValueOnce(conversation(3))
         .mockResolvedValueOnce(conversation(4))

      await expect(waitForStored({ open }, 'c1', 3, { wait })).resolves.toEqual(conversation(4))

      expect(open).toHaveBeenCalledTimes(3)
      expect(open).toHaveBeenCalledWith('c1')
      expect(wait).toHaveBeenCalledWith(4000)
   })

   it('should count the messages it holds when the conversation does not say how many it has', async () => {
      const open = vi.fn().mockResolvedValue({ ...conversation(0, 5), messageCount: undefined })

      await expect(waitForStored({ open }, 'c1', 4, { wait })).resolves.toMatchObject({ id: 'c1' })
   })

   it('should give up, with nothing, after the tries it was given, and go on after a read that failed or found nothing', async () => {
      const open = vi
         .fn()
         .mockRejectedValueOnce(new Error('offline'))
         .mockResolvedValueOnce(undefined)
         .mockResolvedValue(conversation(3))

      await expect(waitForStored({ open }, 'c1', 3, { wait, tries: 4 })).resolves.toBeUndefined()

      expect(open).toHaveBeenCalledTimes(4)
   })
})
