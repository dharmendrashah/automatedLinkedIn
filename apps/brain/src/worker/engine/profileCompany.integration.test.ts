import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { explainMatched } from 'core'
import { fakeDataClient } from 'core/fakeDataClient'

import { IcpService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent.

const email = `${randomUUID()}@elitale.com`
const ADA = 'https://www.linkedin.com/in/ada'
const ACME = 'https://www.linkedin.com/company/acme'

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

const ROWS: Record<string, Record<string, unknown>[]> = {
   profiles: [
      {
         profileUrl: ADA,
         handle: 'ada',
         firstName: 'Ada',
         lastName: 'Lovelace',
         headline: 'Head of Sales',
         experience: [
            {
               position: 'Head of Sales',
               companyName: 'Acme',
               companyLinkedinUrl: ACME,
               startDate: {
                  year: 2024,
                  month: 1,
               },
               endDate: null,
            },
         ],
      },
   ],
   companies: [
      {
         linkedinUrl: ACME,
         companyName: 'Acme',
         industry: 'Software Development',
         employeeCountRange: '51-200',
         website: 'https://www.acme.io/home',
      },
   ],
}

let userId: string
let icpId: string

const deps = (asked: string[]) => ({
   client: fakeDataClient(slug => {
      asked.push(slug)

      return {
         rows: ROWS[slug] ?? [],
         costMicros: 4_000,
      }
   }),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

// Runs the workflow to its end and answers what the data service was asked and what Ada looks like at the end.
const run = async (readCompany: boolean, preview = false) => {
   const graph: Graph = {
      nodes: [
         node('people', 'input.profiles', { links: [ADA] }),
         node('read', 'collect.profile', {
            readCompany,
            keep: false,
         }),
         node('score', 'score.icp', {
            icpId,
            qualifyScore: 50,
            maybeScore: 20,
         }),
      ],
      edges: [line('people', 'read'), line('read', 'score')],
   }
   const workflow = await WorkflowService.create(userId, {
      name: `Company ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const started = await WorkflowService.startRun(
      userId,
      workflow.id,
      preview ? 'PREVIEW' : 'MANUAL',
      `company-${randomUUID()}`
   )
   const asked: string[] = []

   for (let round = 0; round < 6; round += 1) {
      await advanceRun(started?.id ?? '', deps(asked))
   }

   const item = await PrismaService.client.workflowItem.findFirst({
      where: {
         runId: started?.id ?? '',
         nodeId: 'score',
         slug: 'ada',
      },
      select: { data: true },
   })

   return {
      asked,
      ada: item?.data as {
         score: number
         matched: string[]
         companyIndustry?: string | null
         companySize?: string | null
         companyDomain?: string | null
      } | null,
   }
}

describe('Get full profile reads the company of the current job (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      icpId = (
         await IcpService.create(userId, {
            name: `Sales ${randomUUID().slice(0, 8)}`,
            includeTitles: ['sales'],
            excludeTitles: [],
            seniorities: ['HEAD'],
            industries: ['Software'],
            companySizes: ['51 - 200'],
            locations: [],
            problemKeywords: [],
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should score on the headline alone, and say the profile was not read, when the company is not read', async () => {
      const { asked, ada } = await run(false)

      expect(asked).toEqual(['profiles'])
      expect(ada).toMatchObject({ score: 50 })
      expect(ada?.matched).not.toContain('industry "Software"')
      expect(ada?.companyIndustry).toBeUndefined()
   })

   it('should read the company once, put its industry, size and domain on the person, and score again with them', async () => {
      const { asked, ada } = await run(true)

      expect(asked.filter(slug => slug === 'companies')).toEqual(['companies'])
      expect(ada).toMatchObject({
         score: 80,
         companyIndustry: 'Software Development',
         companySize: '51-200',
         companyDomain: 'acme.io',
      })
      expect(explainMatched(ada?.matched ?? []).map(({ label }) => label)).toEqual([
         'Title matches "sales"',
         'Seniority: Head of',
         'Industry: Software',
         'Company size 51 to 200',
      ])
   })

   it('should not pay again for a company read in the last 30 days', async () => {
      const { asked, ada } = await run(true)

      expect(asked).not.toContain('companies')
      expect(ada).toMatchObject({
         score: 80,
         companyDomain: 'acme.io',
      })
   })

   it('should read no company in a preview', async () => {
      await PrismaService.client.pageSnapshot.deleteMany({
         where: {
            userId,
            kind: 'COMPANY',
         },
      })

      const { asked } = await run(true, true)

      expect(asked).not.toContain('companies')
   })
})
