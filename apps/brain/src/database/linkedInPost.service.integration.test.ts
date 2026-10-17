import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LinkedInPostService } from './linkedInPost.service'
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

   it('should add, skip, process, archive, restore and list posts for one owner only', async () => {
      await expect(
         LinkedInPostService.addMany(userId, [post('7000000000000000001'), post('7000000000000000002')])
      ).resolves.toEqual({
         created: 2,
         restored: 0,
         skipped: 0,
      })
      await expect(LinkedInPostService.addMany(userId, [post('7000000000000000001')])).resolves.toEqual({
         created: 0,
         restored: 0,
         skipped: 1,
      })
      await expect(LinkedInPostService.addMany(otherUserId, [post('7000000000000000001')])).resolves.toEqual({
         created: 1,
         restored: 0,
         skipped: 0,
      })

      const { items, total } = await LinkedInPostService.list(userId, firstPage)

      expect(total).toBe(2)
      expect(items.every(item => item.status === 'UNPROCESSED')).toBe(true)

      const [first] = items.filter(item => item.slug === 'activity-7000000000000000001')

      await LinkedInPostService.setStatus(userId, first.id, 'PROCESSED')
      await LinkedInPostService.archiveForUser(userId, first.id)

      const live = await LinkedInPostService.list(userId, firstPage)
      const processed = await LinkedInPostService.list(userId, {
         ...firstPage,
         search: '0001',
         status: 'PROCESSED',
         includeArchived: true,
      })

      expect(live.items.map(item => item.slug)).toEqual(['activity-7000000000000000002'])
      expect(processed.items).toHaveLength(1)
      expect(processed.items[0].archivedAt).toBeInstanceOf(Date)

      await expect(LinkedInPostService.addMany(userId, [post('7000000000000000001')])).resolves.toEqual({
         created: 0,
         restored: 1,
         skipped: 0,
      })
      await expect(LinkedInPostService.getForUser(userId, first.id)).resolves.toMatchObject({
         archivedAt: null,
         status: 'PROCESSED',
      })
   })

   it('should not let another user read or change a post', async () => {
      const [mine] = (await LinkedInPostService.list(userId, firstPage)).items

      await expect(LinkedInPostService.getForUser(otherUserId, mine.id)).resolves.toBeNull()
      await expect(LinkedInPostService.setStatus(otherUserId, mine.id, 'PROCESSED')).resolves.toBeNull()
      await expect(LinkedInPostService.archiveForUser(otherUserId, mine.id)).resolves.toBeNull()
   })
})
