import { describe, expect, it } from 'vitest'

import { accountOfFile, conversationsFromFile, parseMessagesFile } from './fromContract'

const file = {
   conversations: [
      {
         id: '2-abc',
         title: 'Ada Example',
         kind: 'DIRECT',
         participants: [{ name: 'Ada Example', profileUrl: 'https://www.linkedin.com/in/ada/' }],
         unread: true,
         complete: true,
         messages: [
            {
               id: 'm1',
               sender: { name: 'Ada Example' },
               direction: 'THEM',
               date: '2024-01-25',
               time: '17:18',
               when: 'Jan 25, 2024 5:18 PM',
               text: 'Hello',
               attachments: [],
            },
            {
               id: 'm2',
               sender: { name: 'Ada Example' },
               direction: 'THEM',
               date: '2024-01-25',
               when: 'Jan 25, 2024',
               text: 'Second',
               attachments: [{ kind: 'OTHER' }],
            },
         ],
      },
      {
         id: '2-def',
         title: 'Group',
         kind: 'GROUP',
         participants: [{ name: 'One' }, { name: 'Two' }],
         unread: false,
         complete: false,
         messages: [
            { id: 'm3', sender: { name: 'One' }, direction: 'THEM', when: '', text: 'No date', attachments: [] },
         ],
      },
   ],
}

describe('parseMessagesFile', () => {
   it('should read a file of the shape the spider writes', () => {
      expect(parseMessagesFile(file)?.conversations).toHaveLength(2)
   })

   it('should drop conversations and messages that are not of that shape, and give nothing for another file', () => {
      expect(parseMessagesFile({ conversations: [{ id: 1 }, file.conversations[0]] })?.conversations).toHaveLength(1)
      expect(parseMessagesFile({ nope: true })).toBeUndefined()
      expect(parseMessagesFile(null)).toBeUndefined()
   })
})

describe('accountOfFile', () => {
   it('should name the account after the sender of the messages the file holds as its own', () => {
      const mine = (id: string, name: string) => ({
         id,
         sender: { name },
         direction: 'ME' as const,
         when: '',
         text: 'Hi',
         attachments: [],
      })
      const owned = {
         conversations: [
            {
               ...file.conversations[0]!,
               kind: 'DIRECT' as const,
               messages: [mine('a', 'Me'), mine('b', 'Tripti Verma'), mine('c', 'Tripti Verma')],
            },
         ],
      }

      expect(accountOfFile(owned)).toMatchObject({ name: 'Tripti Verma', state: 'ACTIVE' })
   })

   it('should take the name and picture the file gives its account, before any guess from the messages', () => {
      const named = {
         account: { name: 'Tripti Verma', imageUrl: 'https://media.licdn.com/dms/image/me' },
         conversations: [],
      }

      expect(accountOfFile(named)).toMatchObject({
         name: 'Tripti Verma',
         imageUrl: 'https://media.licdn.com/dms/image/me',
      })
      expect(parseMessagesFile(named)?.account?.name).toBe('Tripti Verma')
   })

   it('should still give an account when the file holds no message of its own', () => {
      expect(accountOfFile({ conversations: [] }).name).toBe('My account')
   })
})

describe('conversationsFromFile', () => {
   const account = accountOfFile({ conversations: [] })
   const made = conversationsFromFile(parseMessagesFile(file)!, account)

   it('should give each conversation of the file once, in the account that read it, with its unread mark', () => {
      expect(made.map(conversation => conversation.id)).toEqual(['2-abc', '2-def'])
      expect(made.every(conversation => conversation.accountId === account.id)).toBe(true)
      expect(made.map(conversation => conversation.unread)).toEqual([true, false])
   })

   it('should keep the real day and time of each message, and add no message of its own', () => {
      const times = made[0]!.messages.map(message => message.at)

      expect(times[0]).toBe(new Date(2024, 0, 25, 17, 18).getTime())
      expect(times[1]! - times[0]!).toBe(60_000)
      expect(made[0]?.messages).toHaveLength(2)
      expect(made[0]?.messages.every(message => message.direction === 'THEM')).toBe(true)
   })

   it('should take a message without a time as a minute after the one before, and a conversation of a group as a group', () => {
      const group = made.find(conversation => conversation.kind === 'GROUP')

      expect(group?.participants).toHaveLength(2)
      expect(group?.complete).toBe(false)
      expect(group?.messages[0]?.at).toBeGreaterThan(0)
   })

   it('should show what a message holds that is not words, as a file when it is not known', () => {
      expect(made[0]?.messages[1]?.attachments).toEqual([{ kind: 'FILE' }])
   })

   it('should be the same every time, and give nothing for a file with no conversation', () => {
      expect(conversationsFromFile(parseMessagesFile(file)!, account)).toEqual(made)
      expect(conversationsFromFile({ conversations: [] }, account)).toEqual([])
   })
})
