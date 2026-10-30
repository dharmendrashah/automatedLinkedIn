import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ClientService } from './client.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL, with the migration add_network_hub (its triggers mark the profiles).

const db = PrismaService.client

let userId: string
let acmeId: string
let acmeAccountId: string
let ownAccountId: string

const makeAccount = (clientId: string | null) =>
   db.linkedInAccount.create({
      data: {
         userId,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         status: 'ACTIVE',
         clientId,
      },
   })

const people = (slug: string) =>
   db.person.findMany({
      where: {
         userId,
         slug,
      },
      include: { links: true },
      orderBy: { clientId: 'asc' },
   })

const request = (slug: string, accountId: string, note: string | null = null) =>
   db.linkedInInvitation.create({
      data: {
         userId,
         accountId,
         linkedInId: randomUUID(),
         slug,
         name: 'Ana Silva',
         headline: 'Head of Sales, Bolt',
         note,
      },
   })

const conversation = (slug: string, accountId: string) =>
   db.linkedInConversation.create({
      data: {
         userId,
         accountId,
         linkedInId: randomUUID(),
         title: 'Ana Silva',
         kind: 'DIRECT',
         participants: [{ name: 'Ana Silva', profileUrl: `https://www.linkedin.com/in/${slug}/` }],
         contactProfileUrl: `https://www.linkedin.com/in/${slug}/`,
         unread: true,
         complete: true,
         lastMessageAt: new Date(),
         lastDirection: 'THEM',
         messages: {
            create: {
               linkedInId: randomUUID(),
               direction: 'THEM',
               senderName: 'Ana Silva',
               whenText: 'now',
               text: 'Sure, send the deck',
               attachments: [],
               position: 0,
            },
         },
      },
   })

describe('PeopleIndexService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      acmeId = (await ClientService.create(userId, 'Acme')).id
      acmeAccountId = (await makeAccount(acmeId)).id
      ownAccountId = (await makeAccount(null)).id
   })

   afterAll(async () => {
      await db.user.delete({ where: { id: userId } })
   })

   it('should mark a profile when a row that ties it to the owner is written', async () => {
      await request('marked-one', acmeAccountId)

      expect(
         await db.peopleIndexDirty.count({
            where: {
               userId,
               slug: 'marked-one',
            },
         })
      ).toBe(1)
   })

   it("should build one person per client, each with what waits on it and why they are there", async () => {
      await request('ana', acmeAccountId, 'Loved your post')
      await conversation('ana', ownAccountId)
      await PeopleIndexService.refresh(userId, ['ana'])

      const found = await people('ana')
      const defaultId = await ClientService.defaultId(userId)
      const acme = found.find(({ clientId }) => clientId === acmeId)
      const own = found.find(({ clientId }) => clientId === defaultId)

      expect(found).toHaveLength(2)
      expect(acme).toMatchObject({
         name: 'Ana Silva',
         priority: 1,
         reasonKind: 'REQUEST',
         reasonText: 'Sent you a request: "Loved your post"',
         foundBy: ['request'],
      })
      expect(own).toMatchObject({
         priority: 2,
         reasonText: 'Replied: "Sure, send the deck"',
      })
      expect(own?.links.map(({ kind }) => kind)).toEqual(['CONVERSATION'])
   })

   it('should keep a status the owner chose, and add list members of the default client with their fit', async () => {
      const defaultId = await ClientService.defaultId(userId)
      const list = await db.workflowList.create({
         data: {
            userId,
            name: `List ${randomUUID()}`,
         },
      })

      await db.person.update({
         where: { clientId_slug: { clientId: defaultId, slug: 'ana' } },
         data: {
            status: 'DONE',
            statusSetAt: new Date(),
         },
      })
      await db.workflowListMember.create({
         data: {
            listId: list.id,
            slug: 'ana',
            url: 'https://www.linkedin.com/in/ana/',
            state: 'QUALIFIED',
            score: 81,
            company: 'Bolt',
         },
      })
      await PeopleIndexService.refresh(userId, ['ana'])

      expect(
         await db.person.findUniqueOrThrow({ where: { clientId_slug: { clientId: defaultId, slug: 'ana' } } })
      ).toMatchObject({
         status: 'DONE',
         fit: 'STRONG',
         score: 81,
         company: 'Bolt',
         foundBy: [`list:${list.id}`],
      })
   })

   it('should move people with their account to another client', async () => {
      const other = await ClientService.create(userId, 'Beta')

      await request('moved', ownAccountId)
      await PeopleIndexService.refresh(userId, ['moved'])
      await ClientService.assignAccount(userId, ownAccountId, other.id)
      await PeopleIndexService.refresh(userId, ['moved'])

      expect((await people('moved')).map(({ clientId }) => clientId)).toEqual([other.id])
   })

   it('should drop a person with no rows left, but keep one marked Do not contact', async () => {
      const gone = await request('gone', acmeAccountId)
      const kept = await request('kept', acmeAccountId)

      await PeopleIndexService.refresh(userId, ['gone', 'kept'])
      await db.person.updateMany({
         where: {
            userId,
            slug: 'kept',
         },
         data: { doNotContact: true },
      })
      await db.linkedInInvitation.deleteMany({ where: { id: { in: [gone.id, kept.id] } } })
      await PeopleIndexService.refresh(userId, ['gone', 'kept'])

      expect(await people('gone')).toEqual([])
      expect(await people('kept')).toMatchObject([
         {
            doNotContact: true,
            priority: 0,
            links: [],
         },
      ])
   })

   it('should mark every person of a profile Do not contact when the owner suppresses it', async () => {
      await request('blocked', acmeAccountId)
      await db.suppression.create({
         data: {
            userId,
            slug: 'blocked',
         },
      })
      await PeopleIndexService.refresh(userId, ['blocked'])

      expect((await people('blocked')).map(({ doNotContact }) => doNotContact)).toEqual([true])
   })
})
