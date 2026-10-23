import { describe, expect, it, vi } from 'vitest'

import { type UniboxClient, createTrpcSource, localClock } from './trpcSource'

const conversation = (over: Record<string, unknown> = {}) => ({
   id: 'c1',
   accountId: 'a1',
   kind: 'DIRECT' as const,
   title: 'Ada Lovelace',
   participants: [
      { name: 'Ada Lovelace', profileUrl: 'https://www.linkedin.com/in/ada/', imageUrl: 'https://media.licdn.com/x' },
   ],
   unread: true,
   complete: false,
   messageCount: 9,
   lastMessageAt: '2026-10-22T09:21:00.000Z',
   waitingSince: '2026-10-22T09:20:00.000Z',
   lastReplyAt: '2026-10-22T09:10:00.000Z',
   done: false,
   messages: [
      {
         id: 'm1',
         direction: 'THEM' as const,
         sender: 'Ada Lovelace',
         sentAt: '2026-10-22T09:20:00.000Z',
         when: '9:20 AM',
         text: 'Are you free?',
         attachments: [{ kind: 'IMAGE', name: 'plan.png' }, { kind: 'OTHER' }],
      },
   ],
   ...over,
})

const account = (over: Record<string, unknown> = {}) => ({
   id: 'a1',
   email: 'tripti@example.com',
   status: 'ACTIVE' as const,
   displayName: 'Tripti Verma',
   imageUrl: 'https://media.licdn.com/me',
   messagesReadAt: '2026-10-22T12:00:00.000Z',
   unread: 1,
   ...over,
})

const fake = (over: Partial<Record<string, unknown>> = {}) => {
   const calls = {
      setUnread: vi.fn().mockResolvedValue({ changed: 1 }),
      setDone: vi.fn().mockResolvedValue({ changed: 1 }),
      refresh: vi.fn().mockResolvedValue({ started: 1, skipped: [] }),
   }
   const client = {
      unibox: {
         accounts: { query: vi.fn().mockResolvedValue([account()]) },
         conversations: { query: vi.fn().mockResolvedValue([conversation()]) },
         conversation: {
            query: vi
               .fn()
               .mockResolvedValue({ ...conversation({ complete: true, messageCount: 1 }), truncated: false }),
         },
         setUnread: { mutate: calls.setUnread },
         setDone: { mutate: calls.setDone },
         refresh: { mutate: calls.refresh },
         ...over,
      },
   } as unknown as UniboxClient

   return { client, calls }
}

describe('localClock', () => {
   it('should show the day and time LinkedIn showed whatever the time zone of the viewer', () => {
      const at = localClock('2026-10-22T09:20:00.000Z')
      const date = new Date(at)

      expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([
         2026, 9, 22, 9, 20,
      ])
   })
})

describe('createTrpcSource.load', () => {
   it('should give the accounts as the Unibox knows them, named after what LinkedIn showed', async () => {
      const { client } = fake()
      const data = await createTrpcSource(client).load()

      expect(data.accounts).toEqual([
         {
            id: 'a1',
            name: 'Tripti Verma',
            handle: 'tripti@example.com',
            headline: '',
            state: 'ACTIVE',
            lastReadAt: localClock('2026-10-22T12:00:00.000Z'),
            imageUrl: 'https://media.licdn.com/me',
         },
      ])
      expect(data).toMatchObject({ sample: false, canSend: false, canRefresh: true })
   })

   it('should name an account by its login before it was ever read, and say what each state of an account means for sending', async () => {
      const { client } = fake({
         accounts: {
            query: vi
               .fn()
               .mockResolvedValue([
                  account({ id: 'b', displayName: null, imageUrl: null, messagesReadAt: null, status: 'PENDING' }),
                  account({ id: 'c', status: 'DISABLED' }),
                  account({ id: 'd', status: 'BLOCKED' }),
                  account({ id: 'e', status: 'NEEDS_REAUTH' }),
               ]),
         },
      })
      const { accounts } = await createTrpcSource(client).load()

      expect(accounts[0]).toMatchObject({ name: 'tripti@example.com', state: 'DISCONNECTED' })
      expect(accounts[0]).not.toHaveProperty('lastReadAt')
      expect(accounts[0]).not.toHaveProperty('imageUrl')
      expect(accounts.slice(1).map(({ state }) => state)).toEqual(['PAUSED', 'RESTRICTED', 'DISCONNECTED'])
   })

   it('should give the conversations with their latest messages and what the server says about the rest', async () => {
      const { client } = fake()
      const [first] = (await createTrpcSource(client).load()).conversations

      expect(first).toMatchObject({
         id: 'c1',
         accountId: 'a1',
         kind: 'DIRECT',
         unread: true,
         complete: false,
         messageCount: 9,
         waitingSince: localClock('2026-10-22T09:20:00.000Z'),
         lastReplyAt: localClock('2026-10-22T09:10:00.000Z'),
         contact: { name: 'Ada Lovelace', imageUrl: 'https://media.licdn.com/x' },
      })
      expect(first?.messages).toEqual([
         {
            id: 'm1',
            direction: 'THEM',
            sender: 'Ada Lovelace',
            at: localClock('2026-10-22T09:20:00.000Z'),
            when: '9:20 AM',
            text: 'Are you free?',
            attachments: [{ kind: 'IMAGE', name: 'plan.png' }, { kind: 'FILE' }],
         },
      ])
      expect(first).not.toHaveProperty('doneAt')
   })

   it('should say a closed conversation is done as of its last message, and fall back to the title for a person with no name', async () => {
      const { client } = fake({
         conversations: {
            query: vi
               .fn()
               .mockResolvedValue([
                  conversation({ done: true, participants: [], waitingSince: null, lastReplyAt: null }),
               ]),
         },
      })
      const [first] = (await createTrpcSource(client).load()).conversations

      expect(first?.doneAt).toBe(localClock('2026-10-22T09:21:00.000Z'))
      expect(first?.contact).toEqual({ name: 'Ada Lovelace' })
      expect(first).not.toHaveProperty('waitingSince')
   })
})

describe('createTrpcSource actions', () => {
   it('should open a conversation with all its messages', async () => {
      const { client } = fake()
      const opened = await createTrpcSource(client).open('c1')

      expect(opened).toMatchObject({ id: 'c1', complete: true, messageCount: 1 })
   })

   it('should keep the marks with brain: read and unread, done and open again', async () => {
      const { client, calls } = fake()
      const source = createTrpcSource(client)

      await source.mark(['c1', 'c2'], { unread: false })
      await source.mark(['c1'], { unread: true })
      await source.mark(['c1'], { done: true })
      await source.mark(['c1'], { done: false })

      expect(calls.setUnread).toHaveBeenNthCalledWith(1, { ids: ['c1', 'c2'], unread: false })
      expect(calls.setUnread).toHaveBeenNthCalledWith(2, { ids: ['c1'], unread: true })
      expect(calls.setDone).toHaveBeenNthCalledWith(1, { ids: ['c1'], done: true })
      expect(calls.setDone).toHaveBeenNthCalledWith(2, { ids: ['c1'], done: false })
   })

   it('should send in groups when more ids are marked than one call takes', async () => {
      const { client, calls } = fake()
      const ids = Array.from({ length: 1200 }, (_, index) => `c${index}`)

      await createTrpcSource(client).mark(ids, { unread: false })

      expect(calls.setUnread).toHaveBeenCalledTimes(3)
      expect(calls.setUnread.mock.calls.map(([{ ids: group }]) => group.length)).toEqual([500, 500, 200])
   })

   it('should ask for the messages to be read again, and say plainly that replies are not sent yet', async () => {
      const { client, calls } = fake()
      const source = createTrpcSource(client)

      await expect(source.refresh(['a1'])).resolves.toEqual({ started: 1, skipped: [] })
      expect(calls.refresh).toHaveBeenCalledWith({ accountIds: ['a1'] })

      await source.refresh()

      expect(calls.refresh).toHaveBeenLastCalledWith({})
      await expect(source.send({} as never, 'Hi', [])).resolves.toEqual({
         ok: false,
         reason: expect.stringContaining('not available yet'),
      })
   })
})
