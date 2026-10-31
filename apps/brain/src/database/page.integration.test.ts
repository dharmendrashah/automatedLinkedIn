import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { CompanyPageService } from './companyPage.service'
import { ConflictError } from './conflict'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { PostPageService } from './postPage.service'
import { PrismaService } from './prisma.service'
import { SpendService } from './spend.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { workReads } from './workReads'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const POST_SLUG = 'activity-7452924970042826753'
const POST_URL = `https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826753`

const readerOf = (row: Record<string, unknown>, costMicros: number) =>
   fakeDataClient(() => ({
      rows: [row],
      costMicros,
   }))

let userId: string

describe('company and post pages (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)

      const list = await WorkflowListService.createList(userId, `People ${randomUUID().slice(0, 8)}`)

      await WorkflowListService.addFromRun(
         userId,
         list.id,
         'run-1',
         ['ada', 'bob'].map(slug => ({
            slug,
            url: `https://www.linkedin.com/in/${slug}`,
            name: slug,
            headline: null,
            location: null,
            state: 'QUALIFIED' as const,
            postUrl: slug === 'ada' ? POST_URL : null,
            score: 50,
            signals: [
               {
                  type: 'commented',
                  via: POST_URL,
                  at: null,
                  excerpt: `${slug} says hi`,
               },
            ],
            title: null,
            company: slug === 'ada' ? 'STRIPE' : 'Other',
            followers: null,
            matched: [],
            tags: [],
            known: false,
         }))
      )
      await LinkedInCompanyService.addMany(userId, [
         {
            slug: 'stripe',
            url: 'https://www.linkedin.com/company/stripe',
         },
      ])
      await LinkedInPostService.addMany(userId, [
         {
            slug: POST_SLUG,
            url: POST_URL,
         },
      ])
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should read a company page once a day and show the people from the lists who work there', async () => {
      const reader = readerOf(
         {
            companyName: 'Stripe',
            tagline: 'Payments',
            employeesByFunction: [
               {
                  function: 'Sales',
                  count: 900,
               },
            ],
            companySlug: 'internal',
         },
         4_000
      )
      await CompanyPageService.readFull(userId, 'stripe')
      await workReads(userId, reader)

      const company = await CompanyPageService.detail(userId, 'stripe')

      expect(company).toMatchObject({
         snapshot: {
            name: 'Stripe',
            byFunction: [
               {
                  label: 'Sales',
                  count: 900,
               },
            ],
         },
         people: [expect.objectContaining({ slug: 'ada' })],
      })
      expect(JSON.stringify(company?.snapshot)).not.toContain('internal')
      await expect(CompanyPageService.readFull(userId, 'stripe')).rejects.toBeInstanceOf(ConflictError)
      expect(reader.start).toHaveBeenCalledTimes(1)
      expect(await CompanyPageService.detail(userId, 'nobody')).toBeNull()
   })

   it('should read a post, list the people found from it with their comment, and book it as a post read', async () => {
      await PostPageService.readFull(userId, POST_SLUG)
      await workReads(
         userId,
         readerOf(
            {
               postText: 'Pipeline is hard.',
               authorName: 'Ada',
               authorUrl: 'https://www.linkedin.com/in/ada',
               reactions: 4,
            },
            2_000
         )
      )

      const post = await PostPageService.detail(userId, POST_SLUG)
      const [month] = await SpendService.usage(userId)

      expect(post).toMatchObject({
         snapshot: {
            text: 'Pipeline is hard.',
            reactions: 4,
         },
         authorSlug: 'ada',
      })
      expect(post?.people.map(({ slug, comment }) => [slug, comment])).toEqual([
         ['ada', 'ada says hi'],
         ['bob', 'bob says hi'],
      ])
      expect(month?.workflows).toEqual(
         expect.arrayContaining([
            {
               name: 'Company reads',
               amountMicros: 4_000,
            },
            {
               name: 'Post reads',
               amountMicros: 2_000,
            },
         ])
      )
   })

   it('should delete the stored page when the company or post is archived', async () => {
      const company = await LinkedInCompanyService.bySlug(userId, 'stripe')
      const post = await LinkedInPostService.bySlug(userId, POST_SLUG)

      await LinkedInCompanyService.archiveForUser(userId, company?.id ?? '')
      await LinkedInPostService.archiveForUser(userId, post?.id ?? '')

      expect(await PrismaService.client.pageSnapshot.count({ where: { userId } })).toBe(0)
      await expect(PostPageService.readFull(userId, POST_SLUG)).rejects.toThrow('Restore the post first.')
   })
})
