import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { CompanyPageService } from './companyPage.service'
import { ConflictError } from './conflict'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { PeopleIndexService } from './peopleIndex.service'
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

   it('should read a company page once a day and show the My network people who work there', async () => {
      const reader = readerOf(
         {
            companyName: 'Stripe',
            tagline: 'Payments',
            hqCity: 'San Francisco',
            hqCountry: 'United States',
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
      })
      expect(company).not.toHaveProperty('people')
      // Ada is in a list with the company name "STRIPE"; once she is on My network she shows under the read name "Stripe".
      await PeopleIndexService.refresh(userId, ['ada', 'bob'])
      await expect(CompanyPageService.people(userId, 'stripe')).resolves.toMatchObject({
         total: 1,
         people: [
            expect.objectContaining({
               slug: 'ada',
               matchedBy: 'NAME',
            }),
         ],
      })
      expect(JSON.stringify(company?.snapshot)).not.toContain('internal')
      // The read is written onto the company row, so the Companies table can show, search and filter it.
      expect(
         (
            await LinkedInCompanyService.list(userId, {
               countries: ['United States'],
               search: 'stripe',
               page: 1,
               pageSize: 10,
            })
         ).items
      ).toEqual([
         expect.objectContaining({
            slug: 'stripe',
            name: 'Stripe',
            location: 'San Francisco, United States',
            country: 'United States',
            card: expect.objectContaining({ tagline: 'Payments' }),
            readAt: expect.any(Date),
         }),
      ])
      expect((await LinkedInCompanyService.facets(userId)).countries).toEqual([
         {
            value: 'United States',
            count: 1,
         },
      ])
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

      await PrismaService.client.person.updateMany({
         where: {
            userId,
            slug: 'ada',
         },
         data: { photoUrl: 'https://media.licdn.com/dms/image/ada.jpg' },
      })

      const post = await PostPageService.detail(userId, POST_SLUG)
      const [month] = await SpendService.usage(userId)

      expect(post).toMatchObject({
         snapshot: {
            text: 'Pipeline is hard.',
            reactions: 4,
         },
         author: expect.objectContaining({
            kind: 'person',
            slug: 'ada',
         }),
      })
      expect(post?.people.map(({ slug, comment, photo }) => [slug, comment, photo])).toEqual([
         ['ada', 'ada says hi', 'https://media.licdn.com/dms/image/ada.jpg'],
         ['bob', 'bob says hi', null],
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

   it('should list a read post with its card and the people found from it, and not read it again within 30 days', async () => {
      const page = {
         page: 1,
         pageSize: 10,
      }
      const { items, total } = await LinkedInPostService.list(userId, {
         ...page,
         search: 'pipeline',
         read: 'READ',
         sort: {
            by: 'qualified',
            desc: true,
         },
      })

      expect(total).toBe(1)
      expect(items).toEqual([
         expect.objectContaining({
            slug: POST_SLUG,
            card: expect.objectContaining({
               author: expect.objectContaining({ name: 'Ada' }),
               text: 'Pipeline is hard.',
               reactions: 4,
            }),
            readAt: expect.any(Date),
            people: {
               found: 2,
               qualified: 2,
               first: [expect.objectContaining({ slug: expect.any(String) }), expect.anything()],
            },
         }),
      ])
      expect(
         (
            await LinkedInPostService.list(userId, {
               ...page,
               read: 'UNREAD',
            })
         ).total
      ).toBe(0)
      await expect(LinkedInPostService.counts(userId)).resolves.toEqual({
         toWork: 1,
         done: 0,
      })
      await expect(PostPageService.readMany(userId, { slug: POST_SLUG })).resolves.toEqual({
         reading: 0,
         paused: 0,
         readRecently: 1,
      })
   })

   it('should delete the stored page when the company is archived', async () => {
      const company = await LinkedInCompanyService.bySlug(userId, 'stripe')

      await LinkedInCompanyService.archiveForUser(userId, company?.id ?? '')

      expect(
         await PrismaService.client.pageSnapshot.count({
            where: {
               userId,
               kind: 'COMPANY',
            },
         })
      ).toBe(0)
   })
})
