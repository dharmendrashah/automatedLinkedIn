import { describe, expect, it } from 'vitest'

import { type MessagesFile, messagesFileSchema } from './messages'

const file: MessagesFile = {
   contract: 1,
   part: 1,
   captured_at: '2026-10-22T12:00:00.000Z',
   conversations: [
      {
         id: '2-abc==',
         title: 'Ada Lovelace',
         kind: 'DIRECT',
         participants: [
            {
               name: 'Ada Lovelace',
               profileUrl: 'https://www.linkedin.com/in/ada/',
            },
         ],
         unread: false,
         lastActivity: 'Jan 16',
         complete: true,
         messages: [
            {
               id: 'urn:li:msg_message:(urn:li:fsd_profile:me,2-m1)',
               sender: { name: 'Ada Lovelace' },
               direction: 'THEM',
               date: '2024-01-25',
               time: '17:18',
               when: 'Jan 25, 2024 5:18 PM',
               text: 'Hello',
               attachments: [
                  {
                     kind: 'IMAGE',
                     name: 'photo.png',
                  },
               ],
            },
         ],
      },
   ],
}

describe('messagesFileSchema', () => {
   it('should accept a file of conversations with their messages and senders', () => {
      expect(messagesFileSchema.parse(file)).toEqual(file)
   })

   it('should accept the place and size of a file the spider kept, and refuse a negative size', () => {
      const [conversation] = file.conversations
      const [message] = conversation!.messages
      const withFile = (attachment: object) => ({
         ...file,
         conversations: [
            {
               ...conversation,
               messages: [
                  {
                     ...message,
                     attachments: [attachment],
                  },
               ],
            },
         ],
      })

      expect(
         messagesFileSchema.safeParse(
            withFile({
               kind: 'IMAGE',
               name: 'photo.png',
               key: 'kept/u/a/received/x/0-photo.png',
               bytes: 5,
            })
         ).success
      ).toBe(true)
      expect(
         messagesFileSchema.safeParse(
            withFile({
               kind: 'IMAGE',
               bytes: -1,
            })
         ).success
      ).toBe(false)
   })

   it('should keep a message without a day or a time, as when LinkedIn shows none', () => {
      const [conversation] = file.conversations
      const message = {
         ...conversation!.messages[0]!,
         date: undefined,
         time: undefined,
      }
      const { date: _date, time: _time, ...bare } = message

      expect(
         messagesFileSchema.safeParse({
            ...file,
            conversations: [
               {
                  ...conversation,
                  messages: [bare],
               },
            ],
         }).success
      ).toBe(true)
   })

   it('should accept a file that names the account it was read from, with its picture', () => {
      const named = {
         ...file,
         account: {
            name: 'Tripti Verma',
            imageUrl: 'https://media.licdn.com/dms/image/me',
         },
      }

      expect(messagesFileSchema.safeParse(named).success).toBe(true)
   })

   it('should accept a profile picture address that is https, and refuse one that is not', () => {
      const withImage = (imageUrl: string): unknown => ({
         ...file,
         conversations: [
            {
               ...file.conversations[0],
               participants: [
                  {
                     name: 'Ada Lovelace',
                     imageUrl,
                  },
               ],
            },
         ],
      })

      expect(messagesFileSchema.safeParse(withImage('https://media.licdn.com/dms/image/ada')).success).toBe(true)
      expect(messagesFileSchema.safeParse(withImage('http://media.licdn.com/dms/image/ada')).success).toBe(false)
      expect(messagesFileSchema.safeParse(withImage('javascript:alert(1)')).success).toBe(false)
   })

   it('should refuse an unknown field, a bad direction, a bad day and a bad time', () => {
      const [conversation] = file.conversations
      const message = conversation!.messages[0]!
      const withMessage = (over: object) => ({
         ...file,
         conversations: [
            {
               ...conversation,
               messages: [
                  {
                     ...message,
                     ...over,
                  },
               ],
            },
         ],
      })

      expect(
         messagesFileSchema.safeParse({
            ...file,
            extra: 1,
         }).success
      ).toBe(false)
      expect(messagesFileSchema.safeParse(withMessage({ direction: 'BOTH' })).success).toBe(false)
      expect(messagesFileSchema.safeParse(withMessage({ date: '25/01/2024' })).success).toBe(false)
      expect(messagesFileSchema.safeParse(withMessage({ time: '5:18 PM' })).success).toBe(false)
   })
})
