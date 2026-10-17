import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CompanyPageService } from './companyPage.service'
import { ConflictError } from './conflict'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { type PageReader } from './paidRead'
import { PostPageService } from './postPage.service'
import { PrismaService } from './prisma.service'
import { SpendService } from './spend.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const POST_SLUG = 'activity-7452924970042826753'
const POST_URL = `https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826753`

const readerOf = (row: Record<string, unknown>, costMicros: number) => ({
   collect: vi.fn<PageReader['collect']>(async () => ({
      jobId: 'job-1',
      status: 'completed' as const,
      rows: [row],
      costMicros,
      error: null,
   })),
})

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
            companyId: 'internal',
         },
         4_000
      )
      const company = await CompanyPageService.readFull(userId, 'stripe', reader)

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
      await expect(CompanyPageService.readFull(userId, 'stripe', reader)).rejects.toBeInstanceOf(ConflictError)
      expect(reader.collect).toHaveBeenCalledTimes(1)
      expect(await CompanyPageService.detail(userId, 'nobody')).toBeNull()
   })

   it('should read a post, list the people found from it with their comment, and book it as a post read', async () => {
      const post = await PostPageService.readFull(
         userId,
         POST_SLUG,
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
      await expect(PostPageService.readFull(userId, POST_SLUG, readerOf({}, 0))).rejects.toThrow(
         'Restore the post first.'
      )
   })
})
