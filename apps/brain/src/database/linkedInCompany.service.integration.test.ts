import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const company = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/company/${slug}`,
})

const firstPage = {
   page: 1,
   pageSize: 10,
}

let userId: string
let otherUserId: string

describe('LinkedInCompanyService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should add, skip, archive, restore and list companies for one owner only', async () => {
      await expect(LinkedInCompanyService.addMany(userId, [company('elitale'), company('acme-labs')])).resolves.toEqual(
         {
            created: 2,
            restored: 0,
            skipped: 0,
         }
      )
      await expect(LinkedInCompanyService.addMany(userId, [company('elitale')])).resolves.toEqual({
         created: 0,
         restored: 0,
         skipped: 1,
      })
      await expect(LinkedInCompanyService.addMany(otherUserId, [company('elitale')])).resolves.toEqual({
         created: 1,
         restored: 0,
         skipped: 0,
      })

      const { items, total } = await LinkedInCompanyService.list(userId, firstPage)

      expect(total).toBe(2)
      expect(items.map(item => item.slug).sort()).toEqual(['acme-labs', 'elitale'])

      const [elitale] = items.filter(item => item.slug === 'elitale')

      await LinkedInCompanyService.updateForUser(userId, elitale.id, {
         name: 'Elitale',
         website: 'https://elitale.com',
         tags: ['partner'],
         status: 'CONTACTED',
      })
      await LinkedInCompanyService.archiveForUser(userId, elitale.id)

      const live = await LinkedInCompanyService.list(userId, firstPage)
      const searched = await LinkedInCompanyService.list(userId, {
         ...firstPage,
         search: 'ELITALE.COM',
         tags: ['partner'],
         status: 'CONTACTED',
         includeArchived: true,
      })

      expect(live.items.map(item => item.slug)).toEqual(['acme-labs'])
      expect(searched.items).toHaveLength(1)
      expect(searched.items[0].archivedAt).toBeInstanceOf(Date)

      await expect(LinkedInCompanyService.addMany(userId, [company('elitale')])).resolves.toEqual({
         created: 0,
         restored: 1,
         skipped: 0,
      })
      await expect(LinkedInCompanyService.getForUser(userId, elitale.id)).resolves.toMatchObject({
         archivedAt: null,
         name: 'Elitale',
      })
   })

   it('should not let another user read or change a company', async () => {
      const [mine] = (await LinkedInCompanyService.list(userId, firstPage)).items

      await expect(LinkedInCompanyService.getForUser(otherUserId, mine.id)).resolves.toBeNull()
      await expect(LinkedInCompanyService.updateForUser(otherUserId, mine.id, { notes: 'x' })).resolves.toBeNull()
      await expect(LinkedInCompanyService.archiveForUser(otherUserId, mine.id)).resolves.toBeNull()
   })

   it('should find the owner\u2019s companies by name, ignoring case, for positions with no company link', async () => {
      await expect(LinkedInCompanyService.byNames(userId, [' ELITALE ', 'Nobody'])).resolves.toEqual([
         {
            name: 'ELITALE',
            slug: 'elitale',
         },
      ])
      await expect(LinkedInCompanyService.byNames(otherUserId, ['Elitale'])).resolves.toEqual([])
   })
})
