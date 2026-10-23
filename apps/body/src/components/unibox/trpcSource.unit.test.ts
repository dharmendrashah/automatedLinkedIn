import { TRPCClientError } from '@trpc/client'
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
      expect(data).toMatchObject({ sample: false, canSend: true, canRefresh: true })
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
   it('should know which attachments have a kept file, with their sizes, and ask brain for a link to open one', async () => {
      const query = vi.fn().mockResolvedValue({ url: 'https://signed.example/file' })
      const kept = conversation({
         messages: [
            {
               id: 'm1',
               direction: 'ME' as const,
               sender: 'You',
               sentAt: '2026-10-22T09:20:00.000Z',
               when: '',
               text: '',
               attachments: [{ kind: 'FILE', name: 'cv.pdf', bytes: 9, kept: true }, { kind: 'IMAGE' }],
            },
         ],
      })
      const { client } = fake({
         conversations: { query: vi.fn().mockResolvedValue([kept]) },
         fileLink: { query },
      })
      const source = createTrpcSource(client)
      const { conversations } = await source.load()

      expect(conversations[0]?.messages[0]?.attachments).toEqual([
         {
            kind: 'FILE',
            name: 'cv.pdf',
            bytes: 9,
            kept: true,
         },
         { kind: 'IMAGE' },
      ])
      await expect(source.fileLink?.('m1', 0)).resolves.toBe('https://signed.example/file')
      expect(query).toHaveBeenCalledWith({ messageId: 'm1', index: 0 })
   })

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

   it('should ask for the messages to be read again', async () => {
      const { client, calls } = fake()
      const source = createTrpcSource(client)

      await expect(source.refresh(['a1'])).resolves.toEqual({ started: 1, skipped: [] })
      expect(calls.refresh).toHaveBeenCalledWith({ accountIds: ['a1'] })

      await source.refresh()

      expect(calls.refresh).toHaveBeenLastCalledWith({})
   })
})

describe('createTrpcSource.send', () => {
   const wait = vi.fn(async () => undefined)
   const replies = (...states: Array<{ state: string; failure?: string | null }>) => {
      const query = vi.fn()

      for (const state of states) {
         query.mockResolvedValueOnce({ id: 'r1', ...state })
      }

      return query
   }
   const send = (over: Record<string, unknown>, text = 'Tomorrow works.') => {
      const { client } = fake(over)

      return createTrpcSource(client, { wait }).send({} as never, text, [], 'c1')
   }

   it('should ask brain to send the text of the conversation, follow the reply until it went, and say it was sent', async () => {
      const mutate = vi.fn().mockResolvedValue({ id: 'r1' })
      const query = replies({ state: 'SENDING' }, { state: 'SENDING' }, { state: 'SENT' })

      await expect(send({ send: { mutate }, reply: { query } })).resolves.toEqual({ ok: true })

      expect(mutate).toHaveBeenCalledWith({ conversationId: 'c1', text: 'Tomorrow works.' })
      expect(query).toHaveBeenCalledTimes(3)
      expect(query).toHaveBeenCalledWith({ id: 'r1' })
   })

   it('should say a reply that did not go as it is, with the sentence of brain', async () => {
      const query = replies({ state: 'FAILED', failure: 'LinkedIn did not send the reply.' })

      await expect(
         send({ send: { mutate: vi.fn().mockResolvedValue({ id: 'r1' }) }, reply: { query } })
      ).resolves.toEqual({
         ok: false,
         reason: 'LinkedIn did not send the reply.',
      })
   })

   it('should mark a reply that may have gone as unsure, and so one that was never answered', async () => {
      const mutate = vi.fn().mockResolvedValue({ id: 'r1' })
      const unknown = replies({ state: 'UNKNOWN', failure: 'LinkedIn did not show whether the reply was sent.' })
      const never = vi.fn().mockResolvedValue({ id: 'r1', state: 'SENDING' })

      await expect(send({ send: { mutate }, reply: { query: unknown } })).resolves.toEqual({
         ok: false,
         unsure: true,
         reason: 'LinkedIn did not show whether the reply was sent.',
      })
      await expect(send({ send: { mutate }, reply: { query: never } })).resolves.toMatchObject({
         ok: false,
         unsure: true,
      })
      expect(never).toHaveBeenCalledTimes(460)
   })

   it('should show the sentence of a refusal of brain, and nothing of any other error', async () => {
      const refused = new TRPCClientError('Wait 20 seconds before the next reply from this account.', {
         result: { error: { message: 'x', code: -32003, data: { code: 'PRECONDITION_FAILED' } } },
      })

      await expect(send({ send: { mutate: vi.fn().mockRejectedValue(refused) } })).resolves.toEqual({
         ok: false,
         reason: 'Wait 20 seconds before the next reply from this account.',
      })
      await expect(send({ send: { mutate: vi.fn().mockRejectedValue(new Error('boom: secret')) } })).resolves.toEqual({
         ok: false,
         reason: 'The reply could not be sent. Try again.',
      })
   })

   const PDF = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
   const PNG = new File(['content'], 'photo.png', { type: 'image/png' })

   it('should upload each file under one upload id, then ask brain to send with that id, and follow the reply', async () => {
      const upload = vi.fn(async () => ({ ok: true as const }))
      const mutate = vi.fn().mockResolvedValue({ id: 'r1' })
      const query = replies({ state: 'SENT' })
      const { client } = fake({ send: { mutate }, reply: { query } })

      await expect(
         createTrpcSource(client, { wait, upload }).send(
            {} as never,
            '',
            [
               { kind: 'FILE', name: 'cv.pdf', file: PDF },
               { kind: 'IMAGE', name: 'photo.png', file: PNG },
            ],
            'c1'
         )
      ).resolves.toEqual({ ok: true })

      const [[firstId, first], [secondId, second]] = upload.mock.calls as unknown as Array<[string, File]>

      expect(first).toBe(PDF)
      expect(second).toBe(PNG)
      expect(firstId).toBe(secondId)
      expect(mutate).toHaveBeenCalledWith({ conversationId: 'c1', text: '', uploadId: firstId })
   })

   it('should report the progress of all the files together, by their sizes', async () => {
      const upload = vi.fn(async (_id: string, _file: File, onProgress?: (percent: number) => void) => {
         onProgress?.(50)
         onProgress?.(100)

         return { ok: true as const }
      })
      const { client } = fake({
         send: { mutate: vi.fn().mockResolvedValue({ id: 'r1' }) },
         reply: { query: replies({ state: 'SENT' }) },
      })
      const small = new File(['1'], 'small.png', { type: 'image/png' })
      const large = new File(['123'], 'large.pdf', { type: 'application/pdf' })
      const seen: number[] = []

      await createTrpcSource(client, { wait, upload }).send(
         {} as never,
         '',
         [
            { kind: 'IMAGE', name: 'small.png', file: small },
            { kind: 'FILE', name: 'large.pdf', file: large },
         ],
         'c1',
         { progress: percent => seen.push(percent) }
      )

      // 1 byte then 3: half of the first is 12.5 percent, all of it 25, then 25 + 37.5 and 100.
      expect(seen).toEqual([13, 25, 63, 100])
   })

   it('should send nothing, and say which file, when one cannot be uploaded', async () => {
      const upload = vi.fn(async () => ({ ok: false as const, reason: 'The file is larger than a reply may carry.' }))
      const mutate = vi.fn()
      const { client } = fake({ send: { mutate } })

      await expect(
         createTrpcSource(client, { wait, upload }).send(
            {} as never,
            'Hi',
            [{ kind: 'FILE', name: 'cv.pdf', file: PDF }],
            'c1'
         )
      ).resolves.toEqual({ ok: false, reason: 'cv.pdf: The file is larger than a reply may carry.' })
      expect(mutate).not.toHaveBeenCalled()
   })

   it('should say a file is gone when it has none to upload or there is no way to upload, and refuse a link', async () => {
      const mutate = vi.fn()
      const { client } = fake({ send: { mutate } })
      const withUpload = createTrpcSource(client, { wait, upload: vi.fn() })

      await expect(withUpload.send({} as never, 'Hi', [{ kind: 'FILE', name: 'cv.pdf' }], 'c1')).resolves.toMatchObject(
         {
            ok: false,
            reason: expect.stringContaining('no longer here'),
         }
      )
      await expect(
         createTrpcSource(client, { wait }).send({} as never, 'Hi', [{ kind: 'FILE', name: 'cv.pdf', file: PDF }], 'c1')
      ).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('no longer here') })
      await expect(
         withUpload.send({} as never, 'Hi', [{ kind: 'LINK', name: 'https://example.com' }], 'c1')
      ).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('link') })
      expect(mutate).not.toHaveBeenCalled()
   })

   it('should say when the reply started, and follow a reply brain already has, as the one just sent', async () => {
      const started = vi.fn()
      const { client } = fake({
         send: { mutate: vi.fn().mockResolvedValue({ id: 'r1' }) },
         reply: { query: replies({ state: 'SENT' }, { state: 'FAILED', failure: 'LinkedIn did not send the reply.' }) },
      })
      const source = createTrpcSource(client, { wait })

      await source.send({} as never, 'Hi', [], 'c1', { started })

      expect(started).toHaveBeenCalledWith('r1')
      await expect(source.follow?.('r1')).resolves.toEqual({
         ok: false,
         reason: 'LinkedIn did not send the reply.',
      })
   })

   it('should keep a reply with its text and the names of its files, for brain to say where it is', async () => {
      const reply = {
         id: 'r1',
         text: 'Tomorrow works.',
         files: [{ kind: 'FILE', name: 'cv.pdf', bytes: 9 }],
         startedAt: '2026-10-22T09:30:00.000Z',
         failure: null,
      }
      const { client } = fake({
         conversations: {
            query: vi
               .fn()
               .mockResolvedValue([
                  conversation({ reply: { ...reply, state: 'SENDING' } }),
                  conversation({ id: 'c2', reply: { ...reply, state: 'UNKNOWN' } }),
                  conversation({ id: 'c3', reply: { ...reply, state: 'FAILED', failure: 'Nope.' } }),
               ]),
         },
      })
      const [sending, unknown, failed] = (await createTrpcSource(client).load()).conversations

      expect(sending?.sending).toEqual({
         text: 'Tomorrow works.',
         attachments: [{ kind: 'FILE', name: 'cv.pdf', bytes: 9 }],
         at: Date.parse('2026-10-22T09:30:00.000Z'),
         since: Date.parse('2026-10-22T09:30:00.000Z'),
         replyId: 'r1',
      })
      expect(sending).not.toHaveProperty('failed')
      expect(unknown?.failed).toMatchObject({ unsure: true, replyId: 'r1', text: 'Tomorrow works.' })
      expect(failed?.failed).toMatchObject({ reason: 'Nope.', replyId: 'r1' })
      expect(failed?.failed).not.toHaveProperty('unsure')
   })

   it('should tell brain a reply that did not go was dismissed', async () => {
      const mutate = vi.fn().mockResolvedValue({ changed: 1 })
      const { client } = fake({ dismissReply: { mutate } })

      await createTrpcSource(client).dismissReply?.('r1')

      expect(mutate).toHaveBeenCalledWith({ id: 'r1' })
   })
})
