import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent.

const email = `${randomUUID()}@elitale.com`
const NAME = 'Fintech Leads'
const LABEL = 'fintech leads'
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`
const POST = 'https://www.linkedin.com/posts/someone_topic-activity-7452924970042826760-AbCd'

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const ROWS: Record<string, Record<string, unknown>[]> = {
   companies: [
      {
         linkedinUrl: 'https://www.linkedin.com/company/acme',
         companyName: 'Acme',
         industry: 'Software',
      },
      {
         linkedinUrl: 'https://www.linkedin.com/company/globex',
         companyName: 'Globex',
      },
   ],
   emails: [
      {
         profileUrl: profile('ada'),
         email: 'ada@example.com',
      },
   ],
   jobs: [
      {
         jobId: '4001',
         jobUrl: 'https://www.linkedin.com/jobs/view/4001',
         jobTitle: 'Product manager',
         companyName: 'Jobsco',
         companyUrl: 'https://www.linkedin.com/company/jobsco',
         city: 'London',
         applicants: 4,
      },
   ],
   'post-comments': [
      {
         commenterUrl: profile('bob'),
         commenterName: 'Bob',
         commenterType: 'profile',
         comment: 'Great',
      },
   ],
   'ads-library': [
      {
         adId: 'ad-1',
         adUrl: 'https://www.linkedin.com/ad-library/detail/ad-1',
         paidBy: 'Acme',
         headline: 'Buy now',
      },
   ],
}

const fakeClient = () =>
   fakeDataClient(slug => ({
      rows: ROWS[slug] ?? [],
      costMicros: (ROWS[slug]?.length ?? 0) * 4_000,
   }))

const deps = (client: ReturnType<typeof fakeClient>) => ({
   client,
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

let userId: string

// Runs a one-block workflow to its end and answers what the data service was asked.
const runOnce = async (graph: Graph, preview = false) => {
   await PrismaService.client.workflow.deleteMany({
      where: {
         userId,
         name: NAME,
      },
   })
   await PrismaService.client.workflowList.deleteMany({
      where: {
         userId,
         name: NAME,
      },
   })

   const workflow = await WorkflowService.create(userId, {
      name: NAME,
      goal: null,
      graph,
   })
   const run = await WorkflowService.startRun(
      userId,
      workflow.id,
      preview ? 'PREVIEW' : 'MANUAL',
      `collect-${randomUUID()}`
   )
   const client = fakeClient()

   for (let round = 0; round < 4; round += 1) {
      await advanceRun(run?.id ?? '', deps(client))
   }

   return {
      runId: run?.id ?? '',
      asked: client.start.mock.calls.map(([slug]) => slug),
      params: client.start.mock.calls.map(([, params]) => params),
   }
}

const itemsOf = (runId: string) =>
   PrismaService.client.workflowItem.findMany({
      where: { runId },
      orderBy: { slug: 'asc' },
      select: {
         kind: true,
         slug: true,
         data: true,
      },
   })

const one = (type: GraphNode['type'], config: GraphNode['config']): Graph => ({
   nodes: [node('collect', type, config)],
   edges: [],
})

describe('collect blocks (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should keep what a company search finds under the workflow name, and not search again within a week', async () => {
      const graph = one('collect.searchCompanies', {
         query: 'fintech',
         howMany: 10,
         keep: true,
      })
      const first = await runOnce(graph)
      const companies = await PrismaService.client.linkedInCompany.findMany({
         where: { userId },
         orderBy: { slug: 'asc' },
         select: {
            slug: true,
            name: true,
            tags: true,
            industry: true,
         },
      })

      expect(first.asked).toEqual(['companies'])
      expect(first.params[0]).toEqual({
         query: 'fintech',
         maxResults: 10,
      })
      expect(companies).toEqual([
         {
            slug: 'acme',
            name: 'Acme',
            tags: [LABEL],
            industry: 'Software',
         },
         {
            slug: 'globex',
            name: 'Globex',
            tags: [LABEL],
            industry: null,
         },
      ])

      const again = await runOnce(graph)

      expect(again.asked).toEqual([])
      expect((await itemsOf(again.runId)).map(({ slug }) => slug)).toEqual(['acme', 'globex'])
   })

   it('should keep nothing and remember nothing when the box is not ticked, and in a preview', async () => {
      const graph = one('collect.searchCompanies', {
         query: 'other words',
         howMany: 10,
         keep: false,
      })

      await runOnce(graph)
      const second = await runOnce(graph)
      const preview = await runOnce(
         one('collect.searchCompanies', {
            query: 'preview words',
            keep: true,
         }),
         true
      )

      expect(second.asked).toEqual(['companies'])
      expect(preview.asked).toEqual(['companies'])
      expect(
         await PrismaService.client.linkedInCompany.count({
            where: {
               userId,
               tags: { has: 'other' },
            },
         })
      ).toBe(0)
   })

   it('should leave out a suppressed person before paying, keep the email, and not ask again', async () => {
      await PrismaService.client.suppression.create({
         data: {
            userId,
            slug: 'gone',
         },
      })

      const graph = one('collect.emailsFromLinks', {
         links: [profile('ada'), profile('gone'), 'not a link'],
         keep: true,
      })
      const first = await runOnce(graph)
      const found = await PrismaService.client.linkedInProfile.findUnique({
         where: {
            userId_slug: {
               userId,
               slug: 'ada',
            },
         },
         select: {
            email: true,
            tags: true,
         },
      })

      expect(first.params).toEqual([{ urls: [profile('ada')] }])
      expect((await itemsOf(first.runId)).map(({ slug }) => slug)).toEqual(['ada'])
      expect(found).toEqual({
         email: 'ada@example.com',
         tags: [LABEL],
      })
      expect((await runOnce(graph)).asked).toEqual([])
   })

   it('should keep a job under its company and add the company with the label', async () => {
      const { asked } = await runOnce(
         one('collect.searchJobs', {
            jobTitles: 'product manager',
            howMany: 5,
            keep: true,
         })
      )
      const jobs = await PrismaService.client.linkedInCompanyJob.findMany({ where: { userId } })

      expect(asked).toEqual(['jobs'])
      expect(jobs).toMatchObject([
         {
            jobId: '4001',
            companySlug: 'jobsco',
            title: 'Product manager',
            applicants: 4,
            tags: [LABEL],
         },
      ])
      expect(
         await PrismaService.client.linkedInCompany.count({
            where: {
               userId,
               slug: 'jobsco',
               tags: { has: LABEL },
            },
         })
      ).toBe(1)
   })

   it('should read the commenters of a pasted post link, one request per link, with the limit it was given', async () => {
      const { runId, asked, params } = await runOnce(
         one('collect.commentersFromLinks', {
            links: [POST, 'https://example.com/nothing'],
            howMany: 7,
         })
      )

      expect(asked).toEqual(['post-comments'])
      expect(params[0]).toMatchObject({ maxResults: 7 })
      expect((await itemsOf(runId)).map(({ kind, slug }) => `${kind}:${slug}`)).toEqual(['profile:bob'])
   })

   it('should keep ads in the run only, and read a pasted LinkedIn link but no other site', async () => {
      const { runId, asked } = await runOnce(
         one('collect.adsFromLinks', {
            links: ['https://www.linkedin.com/ad-library/search?companyIds=1', 'https://example.com/ads'],
            howMany: 3,
         })
      )

      expect(asked).toEqual(['ads-library'])
      expect(await itemsOf(runId)).toMatchObject([
         {
            kind: 'ad',
            slug: 'ad-1',
         },
      ])
   })
})
