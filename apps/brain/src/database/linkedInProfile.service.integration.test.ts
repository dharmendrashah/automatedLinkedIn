import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const profile = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
})

let userId: string
let otherUserId: string

describe('LinkedInProfileService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should add, skip, archive, restore and list profiles for one owner only', async () => {
      await expect(
         LinkedInProfileService.addMany(userId, [profile('ada-lovelace'), profile('grace-hopper')])
      ).resolves.toEqual({
         created: 2,
         restored: 0,
         skipped: 0,
      })
      await expect(LinkedInProfileService.addMany(userId, [profile('ada-lovelace')])).resolves.toEqual({
         created: 0,
         restored: 0,
         skipped: 1,
      })
      await expect(LinkedInProfileService.addMany(otherUserId, [profile('ada-lovelace')])).resolves.toEqual({
         created: 1,
         restored: 0,
         skipped: 0,
      })

      const { items, total } = await LinkedInProfileService.list(userId, {
         page: 1,
         pageSize: 10,
      })

      expect(total).toBe(2)
      expect(items.map(item => item.slug).sort()).toEqual(['ada-lovelace', 'grace-hopper'])

      const [ada] = items.filter(item => item.slug === 'ada-lovelace')

      await LinkedInProfileService.updateForUser(userId, ada.id, {
         fullName: 'Ada Lovelace',
         tags: ['vip'],
         status: 'CONTACTED',
      })
      await LinkedInProfileService.archiveForUser(userId, ada.id)

      const live = await LinkedInProfileService.list(userId, {
         page: 1,
         pageSize: 10,
      })
      const searched = await LinkedInProfileService.list(userId, {
         search: 'LOVELACE',
         tag: 'vip',
         status: 'CONTACTED',
         includeArchived: true,
         page: 1,
         pageSize: 10,
      })

      expect(live.items.map(item => item.slug)).toEqual(['grace-hopper'])
      expect(searched.items).toHaveLength(1)
      expect(searched.items[0].archivedAt).toBeInstanceOf(Date)

      await expect(LinkedInProfileService.addMany(userId, [profile('ada-lovelace')])).resolves.toEqual({
         created: 0,
         restored: 1,
         skipped: 0,
      })
      await expect(LinkedInProfileService.getForUser(userId, ada.id)).resolves.toMatchObject({
         archivedAt: null,
         fullName: 'Ada Lovelace',
      })
   })

   it('should not let another user read or change a profile', async () => {
      const [mine] = (
         await LinkedInProfileService.list(userId, {
            page: 1,
            pageSize: 1,
         })
      ).items

      await expect(LinkedInProfileService.getForUser(otherUserId, mine.id)).resolves.toBeNull()
      await expect(LinkedInProfileService.updateForUser(otherUserId, mine.id, { notes: 'x' })).resolves.toBeNull()
      await expect(LinkedInProfileService.archiveForUser(otherUserId, mine.id)).resolves.toBeNull()
   })
})
