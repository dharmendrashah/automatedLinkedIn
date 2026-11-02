import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { inputPickOf } from '@automatedLinkedIn/contracts'

import { InputPickService } from './inputPick.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. A Companies input block takes the companies the Companies page's own filters find.

const email = `${randomUUID()}@elitale.com`
let userId: string

const slugsOf = async (config: Record<string, unknown>) => {
   const filter = await InputPickService.filter(userId, inputPickOf('input.companies', config), null, 'input.companies')
   const rows = await LinkedInCompanyService.pick(userId, 50, filter)

   return {
      slugs: rows.map(({ slug }) => slug).sort(),
      count: await InputPickService.count(userId, 'input.companies', filter),
   }
}

describe('the filters of a Companies input block (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      await LinkedInCompanyService.addMany(
         userId,
         ['acme', 'bolt', 'cyan'].map(slug => ({
            slug,
            url: `https://www.linkedin.com/company/${slug}`,
         }))
      )

      for (const [slug, size, industry] of [
         ['acme', '11-50', 'Software'],
         ['bolt', '11-50', 'Retail'],
         ['cyan', '501-1,000', 'Software'],
      ]) {
         await PrismaService.client.linkedInCompany.updateMany({
            where: {
               userId,
               slug,
            },
            data: {
               size,
               industry,
            },
         })
      }
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should take every company when no filter is on', async () => {
      expect((await slugsOf({})).slugs).toEqual(['acme', 'bolt', 'cyan'])
   })

   it('should take what the drawer filters find, and only those, in the live count too', async () => {
      expect(await slugsOf({ filters: JSON.stringify({ sizes: ['11-50'] }) })).toEqual({
         slugs: ['acme', 'bolt'],
         count: 2,
      })
      expect(
         await slugsOf({
            filters: JSON.stringify({
               sizes: ['11-50'],
               industries: ['Software'],
            }),
         })
      ).toEqual({
         slugs: ['acme'],
         count: 1,
      })
   })

   it('should take the search words together with the filters and the block own status and labels', async () => {
      expect((await slugsOf({ search: 'CYAN' })).slugs).toEqual(['cyan'])
      expect(
         (
            await slugsOf({
               search: 'c',
               filters: JSON.stringify({ industries: ['Software'] }),
            })
         ).slugs
      ).toEqual(['acme', 'cyan'])
      expect(
         (
            await slugsOf({
               statuses: ['CONTACTED'],
               filters: JSON.stringify({ sizes: ['11-50'] }),
            })
         ).count
      ).toBe(0)
   })

   it('should take nothing, not everything, when filters match nothing or the ideal customer is gone', async () => {
      expect((await slugsOf({ filters: JSON.stringify({ sizes: ['10,001+'] }) })).count).toBe(0)
      expect((await slugsOf({ filters: JSON.stringify({ icpId: randomUUID() }) })).count).toBe(0)
   })
})
