import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { KeptFiles } from 'core'

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

   it('should keep the hash of the row a file brings, and keep it when a later file has none', async () => {
      const stored = () =>
         PrismaService.client.linkedInConversation.findFirstOrThrow({
            where: { accountId },
            select: { rowHash: true },
         })

      await LinkedInConversationService.store(owner, file({ rowHash: 'abcdef01' }))
      await expect(stored()).resolves.toEqual({ rowHash: 'abcdef01' })

      await LinkedInConversationService.store(owner, file())
      await expect(stored()).resolves.toEqual({ rowHash: 'abcdef01' })
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

   it('should keep the key of a received file only when it lies in the folder of the account, and drop any other', async () => {
      const prefix = `kept/${userId}/${accountId}/received/`
      const withFiles = (
         id: string,
         attachments: MessagesFile['conversations'][number]['messages'][number]['attachments']
      ) =>
         file({
            id: `2-${id}`,
            title: id,
            messages: [
               {
                  ...message(`f-${id}`, 'THEM', '12:00', ''),
                  attachments,
               },
            ],
         })

      await LinkedInConversationService.store(
         owner,
         withFiles('files', [
            {
               kind: 'IMAGE',
               name: 'ok.png',
               key: `${prefix}aaa/0-ok.png`,
               bytes: 5,
            },
            {
               kind: 'IMAGE',
               name: 'other-owner.png',
               key: `kept/${otherUserId}/${accountId}/received/aaa/0-x.png`,
               bytes: 5,
            },
            {
               kind: 'IMAGE',
               name: 'escape.png',
               key: `${prefix}../../${otherUserId}/x.png`,
               bytes: 5,
            },
         ])
      )

      const row = (await LinkedInConversationService.list(userId)).find(item => item.title === 'files')
      const [first] = row?.messages ?? []
      const stored = await PrismaService.client.linkedInMessage.findFirstOrThrow({
         where: { linkedInId: 'f-files' },
         select: { attachments: true },
      })

      expect(first?.attachments.map(({ name }) => name)).toEqual(['ok.png', 'other-owner.png', 'escape.png'])
      expect(stored.attachments).toEqual([
         {
            kind: 'IMAGE',
            name: 'ok.png',
            key: `${prefix}aaa/0-ok.png`,
            bytes: 5,
         },
         {
            kind: 'IMAGE',
            name: 'other-owner.png',
            bytes: 5,
         },
         {
            kind: 'IMAGE',
            name: 'escape.png',
            bytes: 5,
         },
      ])
   })

   it('should give a message already stored the key of its picture when a later read kept it, and then never change it', async () => {
      const prefix = `kept/${userId}/${accountId}/received/`
      const read = (attachment: object) =>
         file({
            id: '2-late',
            title: 'late',
            messages: [
               {
                  ...message('late-1', 'THEM', '13:00', ''),
                  attachments: [attachment],
               },
            ] as never,
         })
      const stored = async () =>
         (
            await PrismaService.client.linkedInMessage.findFirstOrThrow({
               where: { linkedInId: 'late-1' },
               select: { attachments: true },
            })
         ).attachments

      await LinkedInConversationService.store(
         owner,
         read({
            kind: 'IMAGE',
            name: 'a.png',
         })
      )

      expect(await stored()).toEqual([
         {
            kind: 'IMAGE',
            name: 'a.png',
         },
      ])

      await LinkedInConversationService.store(
         owner,
         read({
            kind: 'IMAGE',
            name: 'a.png',
            key: `${prefix}one/0-a.png`,
            bytes: 5,
         })
      )

      expect(await stored()).toEqual([
         {
            kind: 'IMAGE',
            name: 'a.png',
            key: `${prefix}one/0-a.png`,
            bytes: 5,
         },
      ])

      await LinkedInConversationService.store(
         owner,
         read({
            kind: 'IMAGE',
            name: 'a.png',
            key: `${prefix}two/0-a.png`,
            bytes: 9,
         })
      )

      expect((await stored()) as Array<{ key?: string }>).toMatchObject([{ key: `${prefix}one/0-a.png` }])
   })

   it('should give the message we sent the files of the reply that sent it, once, and the earliest unmatched reply first', async () => {
      const [conversation] = await PrismaService.client.linkedInConversation.findMany({
         where: {
            accountId,
            linkedInId: '2-ada',
         },
         select: { id: true },
      })
      const reply = (uploadId: string, text: string, name: string, createdAt: string) => ({
         userId,
         accountId,
         conversationId: conversation?.id ?? '',
         text,
         state: 'SENT' as const,
         uploadId,
         sessionId: randomUUID(),
         createdAt: new Date(createdAt),
         attachments: [
            {
               name,
               kind: 'FILE',
               bytes: 9,
            },
         ],
      })
      const first = randomUUID()
      const second = randomUUID()

      await PrismaService.client.linkedInReply.createMany({
         data: [
            reply(first, 'The  proposal', 'cv.pdf', '2026-10-22T10:00:00Z'),
            reply(second, 'The proposal', 'offer.pdf', '2026-10-22T10:05:00Z'),
         ],
      })

      const [ada] = file().conversations
      const sent = (id: string) => message(id, 'ME', '10:30', ' The proposal ')
      const messages = [...(ada?.messages ?? []), sent('s1'), sent('s2'), message('s3', 'ME', '10:40', 'Other words')]

      await LinkedInConversationService.store(owner, file({ messages }))

      const attachmentsOf = async (linkedInId: string) =>
         (
            await PrismaService.client.linkedInMessage.findFirstOrThrow({
               where: { linkedInId },
               select: { attachments: true },
            })
         ).attachments

      expect(await attachmentsOf('s1')).toEqual([
         {
            kind: 'FILE',
            name: 'cv.pdf',
            bytes: 9,
            key: `kept/${userId}/${accountId}/sent/${first}/cv.pdf`,
         },
      ])
      expect(await attachmentsOf('s2')).toEqual([
         {
            kind: 'FILE',
            name: 'offer.pdf',
            bytes: 9,
            key: `kept/${userId}/${accountId}/sent/${second}/offer.pdf`,
         },
      ])
      expect(await attachmentsOf('s3')).toEqual([])
      expect(
         await PrismaService.client.linkedInReply.count({
            where: {
               userId,
               matchedAt: { not: null },
            },
         })
      ).toBe(2)
   })

   it('should settle a reply that was not sure when a read stores its message, and leave the others as they are', async () => {
      const read = () =>
         file({
            id: '2-settle',
            title: 'Settle',
            messages: [message('t1', 'THEM', '14:00', 'Can you come?'), message('t2', 'ME', '14:05', 'On my way')],
         })

      await LinkedInConversationService.store(owner, read())

      const conversation = await PrismaService.client.linkedInConversation.findFirstOrThrow({
         where: {
            accountId,
            linkedInId: '2-settle',
         },
         select: { id: true },
      })
      const hour = 3_600_000
      const reply = (text: string, createdAt: Date, extra: Record<string, unknown> = {}) => ({
         userId,
         accountId,
         conversationId: conversation.id,
         text,
         state: 'UNKNOWN' as const,
         sessionId: randomUUID(),
         createdAt,
         ...extra,
      })
      const stateOf = async (sessionId: string) =>
         (await PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { sessionId } })).state
      const found = reply('On  my way', new Date(Date.now() - hour))
      const otherWords = reply('Never typed', new Date(Date.now() - hour))
      const dismissed = reply('On my way', new Date(Date.now() - hour), { dismissedAt: new Date() })
      const later = reply('On my way', new Date(Date.now() + hour))
      const old = reply('On my way', new Date(Date.now() - 8 * 24 * hour))

      await PrismaService.client.linkedInReply.createMany({ data: [found, otherWords, dismissed, later, old] })
      // Any read of the conversation settles, also one that finds nothing new.
      await LinkedInConversationService.store(owner, read())

      expect(await stateOf(found.sessionId)).toBe('SENT')
      expect(await stateOf(otherWords.sessionId)).toBe('UNKNOWN')
      expect(await stateOf(dismissed.sessionId)).toBe('UNKNOWN')
      expect(await stateOf(later.sessionId)).toBe('UNKNOWN')
      expect(await stateOf(old.sessionId)).toBe('UNKNOWN')

      const where = { sessionId: found.sessionId }
      const settled = await PrismaService.client.linkedInReply.findUniqueOrThrow({ where })

      expect(settled.sentAt).not.toBeNull()
      expect(settled.failure).toBeNull()
   })

   it('should link the kept file of a message to its owner only, and never a file that was not kept', async () => {
      const link = vi.spyOn(KeptFiles, 'link').mockResolvedValue('https://signed.example/file')
      const find = (linkedInId: string) =>
         PrismaService.client.linkedInMessage.findFirstOrThrow({
            where: { linkedInId },
            select: { id: true },
         })
      const kept = await find('s1')
      const bare = await find('s3')

      await expect(LinkedInConversationService.fileLink(userId, kept.id, 0)).resolves.toBe(
         'https://signed.example/file'
      )
      expect(link).toHaveBeenCalledWith(userId, expect.stringMatching(/^kept\/.+\/sent\/.+\/cv\.pdf$/), 'cv.pdf')

      await expect(LinkedInConversationService.fileLink(otherUserId, kept.id, 0)).resolves.toBeNull()
      await expect(LinkedInConversationService.fileLink(userId, kept.id, 3)).resolves.toBeNull()
      await expect(LinkedInConversationService.fileLink(userId, bare.id, 0)).resolves.toBeNull()
      expect(link).toHaveBeenCalledTimes(1)

      const { conversationId } = await PrismaService.client.linkedInMessage.findUniqueOrThrow({
         where: { id: kept.id },
         select: { conversationId: true },
      })
      const opened = await LinkedInConversationService.get(userId, conversationId)

      expect(opened?.messages.find(item => item.id === kept.id)?.attachments).toEqual([
         {
            kind: 'FILE',
            name: 'cv.pdf',
            bytes: 9,
            kept: true,
         },
      ])
   })

   it('should never show the conversations of an account that is no longer the owner’s', async () => {
      const moved = await account(otherUserId)

      await LinkedInConversationService.store(
         {
            userId,
            accountId: moved.id,
         },
         file({
            id: '2-moved',
            title: 'Moved',
         })
      )

      const row = await PrismaService.client.linkedInConversation.findFirstOrThrow({
         where: { accountId: moved.id },
         select: { id: true },
      })

      expect((await LinkedInConversationService.list(userId)).some(item => item.id === row.id)).toBe(false)
      await expect(LinkedInConversationService.get(userId, row.id)).resolves.toBeNull()
      await expect(LinkedInConversationService.setUnread(userId, [row.id], false)).resolves.toBe(0)
      await expect(LinkedInConversationService.setDone(userId, [row.id], true)).resolves.toBe(0)
      expect((await LinkedInConversationService.accounts(userId)).some(item => item.id === moved.id)).toBe(false)
   })

   it('should give a person with no picture the one of the connection, by profile name or the first message, and keep a picture the read gave', async () => {
      const photo = (n: string) => `https://media.licdn.com/dms/image/${n}`
      const grace = {
         name: 'Grace Hopper',
         profileUrl: 'https://www.linkedin.com/in/grace-h/',
      }
      const member = {
         name: 'Alan Turing',
         profileUrl: 'https://www.linkedin.com/in/ACoAAturing',
      }

      await LinkedInConversationService.store(
         owner,
         file({
            id: '2-grace',
            title: grace.name,
            participants: [grace],
         })
      )
      await LinkedInConversationService.store(
         owner,
         file({
            id: '2-alan',
            title: member.name,
            participants: [member],
         })
      )
      await PrismaService.client.linkedInConnection.createMany({
         data: [
            ['grace-h', photo('grace')],
            ['alan-t', photo('alan')],
            ['ada', photo('other-ada')],
         ].map(([slug, photoUrl]) => ({
            userId,
            accountId,
            slug: slug ?? '',
            name: slug ?? '',
            headline: '',
            photoUrl,
         })),
      })

      const alan = await PrismaService.client.linkedInConversation.findFirstOrThrow({
         where: {
            accountId,
            linkedInId: '2-alan',
         },
      })

      await PrismaService.client.linkedInReply.create({
         data: {
            userId,
            accountId,
            conversationId: alan.id,
            text: 'Hello',
            state: 'SENT',
            recipientSlug: 'alan-t',
            recipientName: member.name,
         },
      })

      const listed = await LinkedInConversationService.list(userId)
      const byTitle = (title: string) => listed.find(item => item.title === title)

      expect(byTitle(grace.name)).toMatchObject({
         contactSlug: 'grace-h',
         participants: [
            {
               ...grace,
               imageUrl: photo('grace'),
            },
         ],
      })
      expect(byTitle(member.name)).toMatchObject({
         contactSlug: 'alan-t',
         participants: [
            {
               ...member,
               imageUrl: photo('alan'),
            },
         ],
      })
      expect(byTitle(ADA.name)?.participants).toEqual([ADA])
      await expect(LinkedInConversationService.get(userId, alan.id)).resolves.toMatchObject({
         contactSlug: 'alan-t',
         participants: [{ imageUrl: photo('alan') }],
      })
      // Another owner's connection with the same name lends nothing.
      expect(
         (await LinkedInConversationService.list(otherUserId)).every(
            item => !item.participants.some(person => person.imageUrl === photo('grace'))
         )
      ).toBe(true)

      await PrismaService.client.linkedInReply.deleteMany({ where: { userId } })
      await PrismaService.client.linkedInConnection.deleteMany({ where: { userId } })
   })

   it('should find the person of a chat named by member id by the one connection of that name, and nobody when two share it', async () => {
      const chat = (id: string, name: string) =>
         LinkedInConversationService.store(
            owner,
            file({
               id,
               title: name,
               participants: [
                  {
                     name,
                     profileUrl: `https://www.linkedin.com/in/ACoAA${id}`,
                  },
               ],
            })
         )

      await chat('2-prince', 'Prince Patel')
      await chat('2-twin', 'Sam Twin')
      await PrismaService.client.linkedInConnection.createMany({
         data: [
            ['princepatel', 'Prince Patel'],
            ['sam-one', 'Sam Twin'],
            ['sam-two', 'Sam Twin'],
         ].map(([slug, name]) => ({
            userId,
            accountId,
            slug: slug ?? '',
            name: name ?? '',
            headline: '',
         })),
      })

      const listed = await LinkedInConversationService.list(userId)

      expect(listed.find(item => item.title === 'Prince Patel')?.contactSlug).toBe('princepatel')
      expect(listed.find(item => item.title === 'Sam Twin')).not.toHaveProperty('contactSlug')

      await PrismaService.client.linkedInConnection.deleteMany({ where: { userId } })
   })

   it('should delete the conversations with the account', async () => {
      await PrismaService.client.linkedInAccount.delete({ where: { id: accountId } })

      await expect(LinkedInConversationService.list(userId)).resolves.toEqual([])
      await expect(
         PrismaService.client.linkedInMessage.count({ where: { conversation: { accountId } } })
      ).resolves.toBe(0)
   })
})
