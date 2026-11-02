import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type CompanyItem, type JobItem, type PostItem, person } from 'core'

import { CollectCacheService } from './collectCache.service'
import { CollectKeepService } from './collectKeep.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. Nothing is paid: only the owner's own tables are touched.

const email = `${randomUUID()}@elitale.com`
const LABEL = 'fintech leads'
const link = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
})

const company = (slug: string, preview: CompanyItem['preview'] = null): CompanyItem => ({
   kind: 'company',
   slug,
   url: `https://www.linkedin.com/company/${slug}`,
   name: slug,
   hiring: [],
   preview,
})

let userId: string

describe('CollectKeepService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should add found people with the label, fill empty details, and leave what the owner wrote alone', async () => {
      await LinkedInProfileService.addMany(userId, [link('ada')])
      await PrismaService.client.linkedInProfile.updateMany({
         where: {
            userId,
            slug: 'ada',
         },
         data: { fullName: 'Ada by hand' },
      })

      const kept = await CollectKeepService.keep(userId, LABEL, [
         person({
            ...link('ada'),
            name: 'Ada Lovelace',
            headline: 'Engines',
         }),
         person({
            ...link('grace'),
            name: 'Grace Hopper',
            email: 'grace@example.com',
         }),
      ])
      const rows = await PrismaService.client.linkedInProfile.findMany({
         where: { userId },
         orderBy: { slug: 'asc' },
      })

      expect(kept).toMatchObject({
         people: 2,
         skipped: 0,
      })
      expect(
         rows.map(({ slug, fullName, headline, tags, email: found }) => ({
            slug,
            fullName,
            headline,
            tags,
            found,
         }))
      ).toEqual([
         {
            slug: 'ada',
            fullName: 'Ada by hand',
            headline: 'Engines',
            tags: [LABEL],
            found: null,
         },
         {
            slug: 'grace',
            fullName: 'Grace Hopper',
            headline: null,
            tags: [LABEL],
            found: 'grace@example.com',
         },
      ])
   })

   it('should never add people who are on Do not contact, suppressed or archived', async () => {
      await PrismaService.client.person.create({
         data: {
            userId,
            slug: 'refused',
            doNotContact: true,
            lastTouchAt: new Date(),
         },
      })
      await PrismaService.client.suppression.create({
         data: {
            userId,
            slug: 'gone',
         },
      })
      await LinkedInProfileService.addMany(userId, [link('removed')])
      await PrismaService.client.linkedInProfile.updateMany({
         where: {
            userId,
            slug: 'removed',
         },
         data: { archivedAt: new Date() },
      })

      const kept = await CollectKeepService.keep(
         userId,
         LABEL,
         ['refused', 'gone', 'removed', 'fresh'].map(slug => person(link(slug)))
      )
      const added = await PrismaService.client.linkedInProfile.findMany({
         where: {
            userId,
            tags: { has: LABEL },
            archivedAt: null,
         },
         select: { slug: true },
      })

      expect(kept).toMatchObject({
         people: 1,
         skipped: 3,
      })
      expect(added.map(({ slug }) => slug)).toContain('fresh')
      expect(added.map(({ slug }) => slug)).not.toContain('refused')
      expect(added.map(({ slug }) => slug)).not.toContain('gone')
      expect(added.map(({ slug }) => slug)).not.toContain('removed')
      expect(await CollectKeepService.blocked(userId, ['refused', 'gone', 'removed', 'fresh'])).toEqual(
         new Set(['refused', 'gone', 'removed'])
      )
   })

   it('should keep companies with their page, and not add an archived one', async () => {
      await LinkedInCompanyService.addMany(userId, [
         {
            slug: 'old',
            url: 'https://www.linkedin.com/company/old',
         },
      ])
      await PrismaService.client.linkedInCompany.updateMany({
         where: {
            userId,
            slug: 'old',
         },
         data: { archivedAt: new Date() },
      })

      const kept = await CollectKeepService.keep(userId, LABEL, [company('acme'), company('old')])
      const rows = await PrismaService.client.linkedInCompany.findMany({
         where: {
            userId,
            archivedAt: null,
         },
      })

      expect(kept).toMatchObject({
         companies: 1,
         skipped: 1,
      })
      expect(
         rows.map(({ slug, tags, name }) => ({
            slug,
            tags,
            name,
         }))
      ).toEqual([
         {
            slug: 'acme',
            tags: [LABEL],
            name: 'acme',
         },
      ])
      expect([...(await CollectKeepService.rememberedCompanies(userId, ['acme'])).keys()]).toEqual([])
   })

   it('should keep posts under the label without a second row for the same post', async () => {
      const post: PostItem = {
         kind: 'post',
         slug: 'activity-7452924970042826760',
         url: 'https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826760',
         postId: null,
      }

      await CollectKeepService.keep(userId, LABEL, [post])
      await CollectKeepService.keep(userId, 'second label', [post])

      const rows = await PrismaService.client.linkedInPost.findMany({ where: { userId } })

      expect(rows).toHaveLength(1)
      expect(rows[0]?.tags.sort()).toEqual([LABEL, 'second label'].sort())
      expect((await LinkedInPostService.bySlug(userId, post.slug))?.slug).toBe(post.slug)
   })

   it('should keep a job once under its company, refresh it when seen again, and add the company with the label', async () => {
      const job: JobItem = {
         kind: 'job',
         slug: '4001',
         url: 'https://www.linkedin.com/jobs/view/4001',
         title: 'Product manager',
         company: 'Jobsco',
         companySlug: 'jobsco',
         location: 'London',
         posted: null,
         workplace: 'remote',
         employment: 'full-time',
         applicants: 3,
         salary: null,
      }

      await CollectKeepService.keep(userId, LABEL, [job])
      await CollectKeepService.keep(userId, 'second label', [
         {
            ...job,
            applicants: 8,
         },
      ])

      const rows = await PrismaService.client.linkedInCompanyJob.findMany({ where: { userId } })
      const companyRow = await PrismaService.client.linkedInCompany.findUnique({
         where: {
            userId_slug: {
               userId,
               slug: 'jobsco',
            },
         },
      })

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
         applicants: 8,
         companySlug: 'jobsco',
         title: 'Product manager',
      })
      expect(rows[0]?.tags.sort()).toEqual([LABEL, 'second label'].sort())
      expect(companyRow?.tags).toContain(LABEL)
   })

   it('should say which found emails are fresh enough not to be paid for again', async () => {
      const now = new Date()

      expect([...(await CollectKeepService.knownEmails(userId, ['grace', 'ada'], now))]).toEqual([
         ['grace', 'grace@example.com'],
      ])
      expect(
         (await CollectKeepService.knownEmails(userId, ['grace'], new Date(now.getTime() + 91 * 24 * 60 * 60 * 1000)))
            .size
      ).toBe(0)
   })

   const params = {
      query: 'fintech',
      maxResults: 10,
   }

   it('should give back what the same search found within a week, whatever the order of its settings', async () => {
      const items = [company('acme')]

      expect(await CollectCacheService.find(userId, 'companies', params)).toBeNull()

      await CollectCacheService.put(userId, 'companies', params, items)

      expect(
         await CollectCacheService.find(userId, 'companies', {
            maxResults: 10,
            query: 'fintech',
         })
      ).toEqual(items)
      expect(
         await CollectCacheService.find(userId, 'companies', {
            ...params,
            maxResults: 11,
         })
      ).toBeNull()
      expect(await CollectCacheService.find(userId, 'jobs', params)).toBeNull()
   })

   it('should not give back a search older than a week, and drop it on the next save', async () => {
      const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)

      expect(await CollectCacheService.find(userId, 'companies', params, later)).toBeNull()

      await CollectCacheService.put(userId, 'jobs', params, [], later)

      expect(await PrismaService.client.collectSearchCache.count({ where: { userId } })).toBe(1)
   })
})
