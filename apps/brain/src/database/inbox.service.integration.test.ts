import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readSignals } from 'core'

import { InboxService, type RemovedMember } from './inbox.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const found = (slug: string, score: number | null, matched: string[] = []) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
   name: slug,
   headline: 'VP Growth',
   location: null,
   state: score === null ? ('UNSCORED' as const) : ('QUALIFIED' as const),
   postUrl: null,
   score,
   signals: [],
   title: null,
   company: null,
   followers: null,
   matched,
   tags: [],
   known: false,
})

const query = {
   view: 'TODO' as const,
   sort: 'fit' as const,
   page: 1,
   pageSize: 10,
}

// What an undo sends back, as the router reads it.
const undo = (removed: RemovedMember[]) =>
   removed.map(person => ({
      ...person,
      signals: readSignals(person.signals),
   }))

let userId: string
let otherUserId: string
let growthId: string
let foundersId: string

describe('InboxService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      growthId = (await WorkflowListService.createList(userId, 'Growth')).id
      foundersId = (await WorkflowListService.createList(userId, 'Founders')).id
      await WorkflowListService.addFromRun(userId, growthId, 'run-1', [
         found('ada', 70, ['title "growth"', 'commented']),
         found('bob', 40),
      ])
      await WorkflowListService.addFromRun(userId, foundersId, 'run-2', [found('cy', null)])
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should show every list at once, best fit first, with reasons, counts and the list name', async () => {
      const inbox = await InboxService.inbox(userId, query)

      expect(inbox.items.map(({ slug, list }) => [slug, list.name])).toEqual([
         ['ada', 'Growth'],
         ['bob', 'Growth'],
         ['cy', 'Founders'],
      ])
      expect(inbox.items[0]?.reasons).toEqual([
         {
            label: 'Title matches "growth"',
            points: 30,
         },
         {
            label: 'Commented on a post',
            points: 10,
         },
      ])
      expect(inbox.counts).toMatchObject({
         TODO: 3,
         CONTACTED: 0,
         ALL: 3,
      })
      expect(inbox.newThisWeek).toBe(3)
      expect(
         (
            await InboxService.inbox(userId, {
               ...query,
               listId: foundersId,
            })
         ).total
      ).toBe(1)
      expect((await InboxService.inbox(otherUserId, query)).total).toBe(0)
   })

   it('should change many at once for the owner only, stamp contacted, and undo', async () => {
      const { items } = await InboxService.inbox(userId, query)
      const ids = items.map(({ id }) => id)

      await expect(InboxService.setStatus(otherUserId, ids, 'CONTACTED')).resolves.toBe(0)
      await expect(InboxService.setStatus(userId, ids.slice(0, 2), 'CONTACTED')).resolves.toBe(2)

      const contacted = await InboxService.inbox(userId, {
         ...query,
         view: 'CONTACTED',
      })

      expect(contacted.items.every(({ contactedAt }) => contactedAt !== null)).toBe(true)
      expect(contacted.counts).toMatchObject({
         TODO: 1,
         CONTACTED: 2,
      })

      await InboxService.setStatus(userId, ids.slice(0, 2), 'NEW')
      expect((await InboxService.inbox(userId, query)).items.every(({ contactedAt }) => contactedAt === null)).toBe(
         true
      )
   })

   it('should remove people and bring them back with their notes, but never someone marked do not contact', async () => {
      const [ada] = (await InboxService.inbox(userId, query)).items

      await WorkflowListService.updateMember(userId, ada?.id ?? '', { notes: 'Call Tuesday' })

      const removed = await InboxService.remove(userId, [ada?.id ?? ''])

      expect((await InboxService.inbox(userId, query)).total).toBe(2)
      await expect(InboxService.restore(otherUserId, undo(removed))).resolves.toBe(0)
      await expect(InboxService.restore(userId, undo(removed))).resolves.toBe(1)
      expect((await WorkflowListService.memberBySlug(userId, 'ada'))?.notes).toBe('Call Tuesday')

      const again = await InboxService.remove(userId, [ada?.id ?? ''])

      await PrismaService.client.suppression.create({
         data: {
            userId,
            slug: 'ada',
         },
      })
      await expect(InboxService.restore(userId, undo(again))).resolves.toBe(0)
   })

   it('should mark people new until the owner leaves the inbox', async () => {
      expect((await InboxService.inbox(userId, query)).seenAt).toBeNull()
      await InboxService.markSeen(userId)
      expect((await InboxService.inbox(userId, query)).seenAt).toBeInstanceOf(Date)
   })
})
