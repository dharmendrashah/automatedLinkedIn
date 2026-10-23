import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type MessagesFile } from '@automatedLinkedIn/contracts'

import { LinkedInConversationService } from './linkedInConversation.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const ADA = {
   name: 'Ada Lovelace',
   profileUrl: 'https://www.linkedin.com/in/ada/',
   imageUrl: 'https://media.licdn.com/dms/image/ada',
}

const message = (id: string, direction: 'ME' | 'THEM', time: string | undefined, text: string) => ({
   id,
   sender: direction === 'ME' ? { name: 'Tripti Verma' } : { name: ADA.name },
   direction,
   ...(time && {
      date: '2026-10-22',
      time,
   }),
   when: time ?? '',
   text,
   attachments: [],
})

const file = (overrides: Partial<MessagesFile['conversations'][number]> = {}, account = true): MessagesFile => ({
   contract: 1,
   part: 1,
   captured_at: '2026-10-22T12:00:00.000Z',
   ...(account && {
      account: {
         name: 'Tripti Verma',
         imageUrl: 'https://media.licdn.com/dms/image/me',
      },
   }),
   conversations: [
      {
         id: '2-ada',
         title: ADA.name,
         kind: 'DIRECT',
         participants: [ADA],
         unread: true,
         lastActivity: 'Oct 22',
         complete: true,
         messages: [
            message('m1', 'THEM', '09:00', 'Hello'),
            message('m2', 'ME', '09:10', 'Hi Ada'),
            message('m3', 'THEM', '09:20', 'Are you free?'),
            message('m4', 'THEM', undefined, 'Tomorrow?'),
         ],
         ...overrides,
      },
   ],
})

let userId: string
let otherUserId: string
let accountId: string
let owner: { userId: string; accountId: string }

const account = (id: string) =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId: id,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
      },
   })

describe('LinkedInConversationService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await account(userId)).id
      owner = {
         userId,
         accountId,
      }
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should store a file once: the same file again adds nothing', async () => {
      await expect(LinkedInConversationService.store(owner, file())).resolves.toEqual({
         conversations: 1,
         messages: 4,
      })
      await expect(LinkedInConversationService.store(owner, file())).resolves.toEqual({
         conversations: 1,
         messages: 0,
      })

      const [row] = await LinkedInConversationService.list(userId)

      expect(row).toMatchObject({
         title: ADA.name,
         kind: 'DIRECT',
         unread: true,
         complete: true,
         messageCount: 4,
         done: false,
      })
      expect(row?.participants).toEqual([ADA])
   })

   it('should say what the list needs: the latest messages, since when they wait and the last reply', async () => {
      const [row] = await LinkedInConversationService.list(userId)

      expect(row?.messages.map(({ text }) => text)).toEqual(['Hi Ada', 'Are you free?', 'Tomorrow?'])
      expect(row?.waitingSince?.toISOString()).toBe('2026-10-22T09:20:00.000Z')
      expect(row?.lastReplyAt?.toISOString()).toBe('2026-10-22T09:10:00.000Z')
      expect(row?.lastMessageAt?.toISOString()).toBe('2026-10-22T09:21:00.000Z')
   })

   it('should name the account from the file, and count what is unread', async () => {
      const [stored] = await LinkedInConversationService.accounts(userId)

      expect(stored).toMatchObject({
         id: accountId,
         displayName: 'Tripti Verma',
         imageUrl: 'https://media.licdn.com/dms/image/me',
         unread: 1,
      })
      expect(stored?.messagesReadAt).not.toBeNull()
   })

   it('should give the whole conversation when it is opened, oldest first', async () => {
      const [{ id }] = await LinkedInConversationService.list(userId)
      const opened = await LinkedInConversationService.get(userId, id as string)

      expect(opened?.messages.map(({ text }) => text)).toEqual(['Hello', 'Hi Ada', 'Are you free?', 'Tomorrow?'])
      expect(opened?.truncated).toBe(false)
   })

   it('should keep the owner marks when the file comes again, and bring the conversation back on a new message from them', async () => {
      const [{ id }] = await LinkedInConversationService.list(userId)

      await LinkedInConversationService.setUnread(userId, [id as string], false)
      await LinkedInConversationService.setDone(userId, [id as string], true)
      await LinkedInConversationService.store(owner, file())

      let [row] = await LinkedInConversationService.list(userId)

      expect(row).toMatchObject({
         unread: false,
         done: true,
      })

      const [more] = file().conversations

      await LinkedInConversationService.store(
         owner,
         file({ messages: [...(more?.messages ?? []), message('m5', 'THEM', '10:00', 'Hello again')] })
      )
      ;[row] = await LinkedInConversationService.list(userId)

      expect(row).toMatchObject({
         unread: true,
         done: false,
         messageCount: 5,
      })
      expect(row?.waitingSince?.toISOString()).toBe('2026-10-22T09:20:00.000Z')
   })

   it('should open a closed conversation again, and treat a part read of it as incomplete only until a full read', async () => {
      const [{ id }] = await LinkedInConversationService.list(userId)

      await LinkedInConversationService.setDone(userId, [id as string], true)
      await LinkedInConversationService.setDone(userId, [id as string], false)

      expect((await LinkedInConversationService.list(userId))[0]?.done).toBe(false)

      await LinkedInConversationService.store(
         owner,
         file({
            id: '2-part',
            title: 'Partly',
            complete: false,
            messages: [message('p1', 'THEM', '11:00', 'Hi')],
         })
      )
      await LinkedInConversationService.store(
         owner,
         file({
            id: '2-part',
            title: 'Partly',
            complete: true,
            messages: [message('p1', 'THEM', '11:00', 'Hi')],
         })
      )
      await LinkedInConversationService.store(
         owner,
         file({
            id: '2-part',
            title: 'Partly',
            complete: false,
            messages: [message('p1', 'THEM', '11:00', 'Hi')],
         })
      )

      const partly = (await LinkedInConversationService.list(userId)).find(row => row.title === 'Partly')

      expect(partly?.complete).toBe(true)
   })

   it('should show a conversation to its owner only', async () => {
      const [{ id }] = await LinkedInConversationService.list(userId)

      await expect(LinkedInConversationService.list(otherUserId)).resolves.toEqual([])
      await expect(LinkedInConversationService.get(otherUserId, id as string)).resolves.toBeNull()
      await expect(LinkedInConversationService.setUnread(otherUserId, [id as string], false)).resolves.toBe(0)
      await expect(LinkedInConversationService.setDone(otherUserId, [id as string], true)).resolves.toBe(0)
   })

   it('should delete the conversations with the account', async () => {
      await PrismaService.client.linkedInAccount.delete({ where: { id: accountId } })

      await expect(LinkedInConversationService.list(userId)).resolves.toEqual([])
      await expect(
         PrismaService.client.linkedInMessage.count({ where: { conversation: { accountId } } })
      ).resolves.toBe(0)
   })
})
