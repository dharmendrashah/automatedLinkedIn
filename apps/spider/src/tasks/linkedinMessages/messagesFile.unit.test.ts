import { describe, expect, it } from 'vitest'

import { type Conversation, messagesFileSchema } from '@automatedLinkedIn/contracts'

import { fileName, partsOf } from './messagesFile'

const conversation = (id: string, messages: number, size = 10): Conversation => ({
   id,
   title: `Person ${id}`,
   kind: 'DIRECT',
   participants: [{ name: `Person ${id}` }],
   unread: false,
   lastActivity: 'Jan 16',
   complete: true,
   messages: Array.from({ length: messages }, (_, index) => ({
      id: `${id}-m${index}`,
      sender: { name: `Person ${id}` },
      direction: 'THEM' as const,
      when: 'Jan 16',
      text: 'x'.repeat(size),
      attachments: [],
   })),
})

const at = '2026-10-22T12:00:00.000Z'

describe('partsOf', () => {
   it('should put everything in one file that fits, in the contract shape', () => {
      const parts = partsOf([conversation('a', 2), conversation('b', 3)], at, 100_000)

      expect(parts).toHaveLength(1)
      expect(messagesFileSchema.parse(parts[0])).toMatchObject({
         contract: 1,
         part: 1,
         captured_at: at,
      })
      expect(parts[0]?.conversations.map(found => found.id)).toEqual(['a', 'b'])
   })

   it('should start a new numbered file when the next conversation would not fit, keeping the order', () => {
      const one = JSON.stringify(partsOf([conversation('a', 5, 200)], at, 1_000_000)[0]).length
      const parts = partsOf(
         [conversation('a', 5, 200), conversation('b', 5, 200), conversation('c', 5, 200)],
         at,
         one + 50
      )

      expect(parts.map(part => part.part)).toEqual([1, 2, 3])
      expect(parts.flatMap(part => part.conversations.map(found => found.id))).toEqual(['a', 'b', 'c'])
   })

   it('should cut the oldest messages of a conversation too big for a file, and say it is not complete', () => {
      const [part] = partsOf([conversation('big', 400, 500)], at, 50_000)
      const [kept] = part!.conversations

      expect(JSON.stringify(part).length).toBeLessThanOrEqual(50_000)
      expect(kept?.complete).toBe(false)
      // The newest are kept: they are the last of the list.
      expect(kept?.messages.at(-1)?.id).toBe('big-m399')
      expect(kept?.messages.length).toBeLessThan(400)
   })

   it('should make no file when nothing was read', () => {
      expect(partsOf([], at, 100_000)).toEqual([])
   })
})

describe('fileName', () => {
   it('should call the first file messages.json and the others messages-N.json', () => {
      expect(fileName(1)).toBe('messages.json')
      expect(fileName(3)).toBe('messages-3.json')
   })
})
