import { describe, expect, it } from 'vitest'

import { messagesFileSchema } from '@automatedLinkedIn/contracts'

import { partsOf } from '../tasks/linkedinMessages/messagesFile'
import { type ReadMessage, toContractMessages } from './messageReader'

const message = (attachments: ReadMessage['attachments']): ReadMessage => ({
   id: 'm1',
   sender: { name: 'Ada' },
   direction: 'THEM',
   when: 'Today',
   text: 'Hello',
   attachments,
})

describe('toContractMessages', () => {
   it('should give on only what the contract knows, so any attachment the reader can find passes the strict schema', () => {
      const messages = toContractMessages([
         message([
            {
               kind: 'IMAGE',
               url: 'https://www.linkedin.com/dms/prv/image/v2/x/messaging-image-720/y',
            },
            {
               kind: 'IMAGE',
               name: 'plan.png',
               url: 'https://media.licdn.com/dms/image/plan',
            },
            {
               kind: 'IMAGE',
               name: 'kept.png',
               key: 'kept/u/a/received/h/0-kept.png',
               bytes: 1234,
            },
            { kind: 'FILE' },
         ]),
      ])

      expect(messages[0]?.attachments).toEqual([
         { kind: 'IMAGE' },
         {
            kind: 'IMAGE',
            name: 'plan.png',
         },
         {
            kind: 'IMAGE',
            name: 'kept.png',
            key: 'kept/u/a/received/h/0-kept.png',
            bytes: 1234,
         },
         { kind: 'FILE' },
      ])
      expect(JSON.stringify(messages)).not.toContain('licdn.com')
      expect(JSON.stringify(messages)).not.toContain('linkedin.com/dms')
   })

   it('should leave the rest of a message as it is', () => {
      const [given] = toContractMessages([message([])])

      expect(given).toMatchObject({
         id: 'm1',
         direction: 'THEM',
         text: 'Hello',
         attachments: [],
      })
   })

   it('should produce a file the contract accepts', () => {
      const messages = toContractMessages([
         message([
            {
               kind: 'IMAGE',
               url: 'https://www.linkedin.com/dms/prv/image/v2/x',
            },
         ]),
      ])
      const parts = partsOf(
         [
            {
               id: 't',
               title: 'Ada',
               kind: 'DIRECT',
               participants: [],
               unread: false,
               lastActivity: '',
               complete: false,
               messages,
            },
         ],
         '2026-10-24T00:00:00.000Z'
      )

      expect(() => parts.forEach(part => messagesFileSchema.parse(part))).not.toThrow()
   })
})
