import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'

import { LinkedInConversationService, PrismaService, UserService } from 'database'

import { type MessagesFile } from '@automatedLinkedIn/contracts'

import { router } from 'trpc'

import { type Context } from '../../context'
import { unibox } from './unibox'

// Needs PostgreSQL. The router over the real services: a file stored for one owner is listed, opened and marked by that owner only.

const emails = [`${randomUUID()}@elitale.com`, `${randomUUID()}@elitale.com`]

const file: MessagesFile = {
   contract: 1,
   part: 1,
   captured_at: '2026-10-22T12:00:00.000Z',
   account: { name: 'Tripti Verma' },
   conversations: [
      {
         id: '2-ada',
         title: 'Ada Lovelace',
         kind: 'DIRECT',
         participants: [{ name: 'Ada Lovelace' }],
         unread: true,
         lastActivity: 'Oct 22',
         complete: true,
         messages: [
            {
               id: 'm1',
               sender: { name: 'Ada Lovelace' },
               direction: 'THEM',
               date: '2026-10-22',
               time: '09:00',
               when: '9:00 AM',
               text: 'Hello',
               attachments: [],
            },
         ],
      },
   ],
}

let owner: Awaited<ReturnType<typeof UserService.create>>
let stranger: Awaited<ReturnType<typeof UserService.create>>
let accountId: string

const as = (user: typeof owner) =>
   router({ unibox }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub',
      },
      user,
   } as unknown as Context).unibox

describe('unibox router (database)', () => {
   beforeAll(async () => {
      owner = await UserService.create({ email: emails[0] ?? '' })
      stranger = await UserService.create({ email: emails[1] ?? '' })

      const sealed = CryptoService.seal('{}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId: owner.id,
               email: `${randomUUID()}@example.com`,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id
      await LinkedInConversationService.store(
         {
            userId: owner.id,
            accountId,
         },
         file
      )
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: emails } } })
      await PrismaService.disconnect()
   })

   it('should list the accounts and conversations of the owner, and open and mark one', async () => {
      const api = as(owner)
      const [account] = await api.accounts()
      const [listed] = await api.conversations({})

      expect(account).toMatchObject({
         id: accountId,
         displayName: 'Tripti Verma',
         unread: 1,
      })
      expect(listed).toMatchObject({
         title: 'Ada Lovelace',
         unread: true,
         done: false,
         messageCount: 1,
      })

      const opened = await api.conversation({ id: listed?.id ?? '' })

      expect(opened.messages.map(({ text }) => text)).toEqual(['Hello'])

      await expect(
         api.setUnread({
            ids: [opened.id],
            unread: false,
         })
      ).resolves.toEqual({ changed: 1 })
      await expect(
         api.setDone({
            ids: [opened.id],
            done: true,
         })
      ).resolves.toEqual({ changed: 1 })

      expect((await api.conversations({ accountIds: [accountId] }))[0]).toMatchObject({
         unread: false,
         done: true,
      })
      await expect(api.conversations({ accountIds: [randomUUID()] })).resolves.toEqual([])
   })

   it('should show nothing of it to another user', async () => {
      const api = as(stranger)
      const [listed] = await as(owner).conversations({})

      await expect(api.conversations({})).resolves.toEqual([])
      await expect(api.accounts()).resolves.toEqual([])
      await expect(api.conversation({ id: listed?.id ?? '' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         api.setUnread({
            ids: [listed?.id ?? ''],
            unread: true,
         })
      ).resolves.toEqual({ changed: 0 })
   })
})
