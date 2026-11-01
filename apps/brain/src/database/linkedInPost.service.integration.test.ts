import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LinkedInPostService } from './linkedInPost.service'
import { importedOf } from './linkedInRecord'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const post = (id: string) => ({
   slug: `activity-${id}`,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}`,
})

const firstPage = {
   page: 1,
   pageSize: 10,
}

const slugsOf = async (query: Parameters<typeof LinkedInPostService.list>[1]) =>
   (await LinkedInPostService.list(userId, query)).items.map(({ slug }) => slug)

let userId: string
let otherUserId: string

describe('LinkedInPostService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should add, skip, mark done and list posts for one owner only', async () => {
      await expect(
         LinkedInPostService.addMany(userId, [post('7000000000000000001'), post('7000000000000000002')])
      ).resolves.toEqual({
         created: 2,
         restored: 0,
         skipped: 0,
      })
      await expect(LinkedInPostService.addMany(userId, [post('7000000000000000001')])).resolves.toMatchObject({
         created: 0,
         skipped: 1,
      })
      await LinkedInPostService.addMany(otherUserId, [post('7000000000000000001')])

      const { items, total } = await LinkedInPostService.list(userId, firstPage)

      expect(total).toBe(2)
      expect(items.map(({ card, readAt, people }) => [card, readAt, people])).toEqual([
         [
            null,
            null,
            {
               found: 0,
               qualified: 0,
               first: [],
            },
         ],
         [
            null,
            null,
            {
               found: 0,
               qualified: 0,
               first: [],
            },
         ],
      ])

      const first = items.find(item => item.slug === 'activity-7000000000000000001')

      await expect(LinkedInPostService.setStatusMany(otherUserId, [first?.id ?? ''], 'PROCESSED')).resolves.toBe(0)
      await expect(LinkedInPostService.setStatusMany(userId, [first?.id ?? ''], 'PROCESSED')).resolves.toBe(1)
      expect(
         await slugsOf({
            ...firstPage,
            status: 'PROCESSED',
            search: '0001',
         })
      ).toEqual(['activity-7000000000000000001'])
      expect(
         await slugsOf({
            ...firstPage,
            status: 'UNPROCESSED',
         })
      ).toEqual(['activity-7000000000000000002'])
      expect(
         await slugsOf({
            ...firstPage,
            sort: {
               by: 'createdAt',
               desc: false,
            },
         })
      ).toEqual(['activity-7000000000000000001', 'activity-7000000000000000002'])
      await expect(LinkedInPostService.getForUser(otherUserId, first?.id ?? '')).resolves.toBeNull()
      await expect(
         LinkedInPostService.updateForUser(otherUserId, first?.id ?? '', { status: 'PROCESSED' })
      ).resolves.toBeNull()
   })

   it('should preview and import posts with the shared and their own labels, telling new posts apart', async () => {
      const { links } = importedOf(
         [
            {
               url: post('7000000000000000002').url,
               labels: ['saas'],
            },
            {
               url: post('7000000000000000003').url,
               labels: ['hiring'],
            },
         ],
         'post'
      )

      expect((await LinkedInPostService.preview(userId, links)).map(({ slug, state }) => [slug, state])).toEqual([
         ['activity-7000000000000000002', 'ALREADY_HERE'],
         ['activity-7000000000000000003', 'NEW'],
      ])

      const imported = await LinkedInPostService.importMany(
         userId,
         links.map(link => ({
            ...link,
            expandedUrl: null,
         })),
         ['import-2026-11-01']
      )

      expect(imported).toMatchObject({
         created: 1,
         skipped: 1,
         full: 0,
         fresh: ['activity-7000000000000000003'],
      })
      expect(
         await slugsOf({
            ...firstPage,
            tags: ['import-2026-11-01', 'hiring'],
            tagMatch: 'all',
         })
      ).toEqual(['activity-7000000000000000003'])
      expect(
         await slugsOf({
            ...firstPage,
            tags: ['saas'],
         })
      ).toEqual(['activity-7000000000000000002'])
   })

   it('should bring archived posts back as done and labelled archived', async () => {
      const [archived] = await PrismaService.client.linkedInPost.createManyAndReturn({
         data: [
            {
               userId,
               ...post('7000000000000000009'),
               tags: ['old'],
               archivedAt: new Date(),
            },
         ],
      })
      const sql = await readFile(
         join(__dirname, '../../prisma/migrations/20261101200000_restore_archived_posts/migration.sql'),
         'utf8'
      )

      await PrismaService.client.$executeRawUnsafe(sql)

      await expect(LinkedInPostService.getForUser(userId, archived?.id ?? '')).resolves.toMatchObject({
         archivedAt: null,
         status: 'PROCESSED',
         tags: ['old', 'archived'],
      })
      expect((await LinkedInPostService.waiting(userId, 10)).map(({ slug }) => slug)).not.toContain(
         'activity-7000000000000000009'
      )
   })
})
