import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type GraphNode } from '@automatedLinkedIn/contracts'

import { type Context } from './context'
import { bestPerCompany, scoreCompanies, scoreSignals, spaceOut, stopContacting } from './rankBlocks'

const mocks = vi.hoisted(() => ({
   getForUser: vi.fn(),
   seenAmong: vi.fn(),
   replaceItems: vi.fn(),
   recordPeople: vi.fn(),
   recordCompanies: vi.fn(),
   forPeople: vi.fn(),
   forCompanies: vi.fn(),
   forSlugs: vi.fn(),
   ofCompanies: vi.fn(),
   stopContacting: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: (values: string[]) => values,
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', () => ({
   IcpService: { getForUser: mocks.getForUser },
   WalletService: {},
   floorMicros: () => 0,
   WorkflowListService: { seenAmong: mocks.seenAmong },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   SignalService: {
      recordPeople: mocks.recordPeople,
      recordCompanies: mocks.recordCompanies,
      forPeople: mocks.forPeople,
      forCompanies: mocks.forCompanies,
   },
   PersonDatesService: { forSlugs: mocks.forSlugs },
   ColleaguesService: { ofCompanies: mocks.ofCompanies },
   PeopleService: { stopContacting: mocks.stopContacting },
}))

const NOW = new Date('2026-11-01T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

const at = {
   runId: 'r1',
   nodeId: 'n1',
   round: 0,
}

const who = (slug: string, changes: Partial<ReturnType<typeof person>> = {}) =>
   person({
      slug,
      url: `https://www.linkedin.com/in/${slug}`,
      ...changes,
   })

const context = (type: GraphNode['type'], config: GraphNode['config'], inputs: unknown[], preview = false) =>
   ({
      run: {
         id: 'r1',
         userId: 'u1',
      },
      graph: {
         nodes: [],
         edges: [],
      },
      node: {
         id: 'n1',
         type,
         config,
         position: {
            x: 0,
            y: 0,
         },
      },
      step: { id: 's1' },
      at,
      inputs,
      preview,
      deps: {},
   }) as unknown as Context

type Saved = Array<{ slug: string; score?: number; tier?: string; result?: { reason: string | null; status: string } }>

// What the block kept for an Else after it (the first save) and for the lines after it (the second).
const savedElse = () => mocks.replaceItems.mock.calls[0] as [{ nodeId: string }, Saved]
const savedMain = () => mocks.replaceItems.mock.calls[1]?.[1] as Saved
const slugs = (items: Saved) => items.map(({ slug }) => slug)

beforeEach(() => {
   vi.resetAllMocks()
   mocks.getForUser.mockResolvedValue({
      includeTitles: ['growth'],
      excludeTitles: [],
      seniorities: ['HEAD'],
      locations: ['india'],
      industries: [],
      companySizes: [],
      problemKeywords: ['outreach'],
   })
   mocks.seenAmong.mockResolvedValue(new Set())
   mocks.forPeople.mockResolvedValue(new Map())
   mocks.forCompanies.mockResolvedValue(new Map())
   mocks.forSlugs.mockResolvedValue(new Map())
   mocks.ofCompanies.mockResolvedValue(new Map())
   mocks.stopContacting.mockResolvedValue(0)
})

describe('scoreSignals', () => {
   const ada = who('ada', {
      headline: 'Head of Growth',
      location: 'Pune, India',
      enriched: true,
      signals: [
         {
            type: 'commented',
            via: 'https://www.linkedin.com/posts/x',
            at: new Date().toISOString(),
            excerpt: 'Nice',
         },
      ],
   })

   it('should score fit and a fresh signal, keep the signals it found, and say why', async () => {
      const result = await scoreSignals(context('score.signals', { icpId: 'i1' }, [ada]))
      const [ranked] = savedMain()

      expect(ranked).toMatchObject({
         slug: 'ada',
         score: 58,
         tier: 'C',
      })
      expect(mocks.recordPeople).toHaveBeenCalledWith('u1', [
         expect.objectContaining({
            slug: 'ada',
            type: 'commented',
            excerpt: 'Nice',
         }),
      ])
      expect(result.message).toBe('1 in, 0 A, 0 B, 1 C, 0 D, 0 to Else.')
   })

   it('should write nothing in a preview, but still count the signals it found', async () => {
      await scoreSignals(context('score.signals', { icpId: 'i1' }, [ada], true))

      expect(mocks.recordPeople).not.toHaveBeenCalled()
      expect(savedMain()[0].score).toBeGreaterThan(0)
   })

   it('should send a person on Do not contact, a competitor and (when asked) tier D to Else, each with its reason', async () => {
      mocks.seenAmong.mockResolvedValue(new Set(['stopped']))
      mocks.forPeople.mockResolvedValue(
         new Map([
            [
               'rival',
               [
                  {
                     type: 'competitor',
                     at: daysAgo(3),
                  },
               ],
            ],
         ])
      )

      await scoreSignals(
         context(
            'score.signals',
            {
               icpId: 'i1',
               keepTierD: false,
            },
            [ada, who('stopped'), who('rival'), who('nobody')]
         )
      )

      const [, rest] = savedElse()

      expect(slugs(savedMain())).toEqual(['ada'])
      expect(Object.fromEntries(rest.map(item => [item.slug, item.result?.reason]))).toEqual({
         stopped: 'Excluded: do not contact.',
         rival: 'Excluded: competitor.',
         nobody: 'Tier D.',
      })
   })

   it('should stop with the ideal customer sentence when it was deleted', async () => {
      mocks.getForUser.mockResolvedValue(null)

      await expect(scoreSignals(context('score.signals', { icpId: 'gone' }, [ada]))).rejects.toThrow(
         'The ideal customer this workflow scores against was deleted.'
      )
   })
})

describe('scoreCompanies', () => {
   it('should score a company on its page and a hiring signal, and say how many were not read', async () => {
      const read = {
         kind: 'company' as const,
         slug: 'acme',
         url: 'https://www.linkedin.com/company/acme',
         name: 'Acme',
         hiring: ['Growth lead'],
         preview: {
            name: 'Acme',
            tagline: 'Outreach tools',
            industry: 'Software',
            employeeRange: null,
            headquarters: 'Pune, India',
            specialities: [],
         },
      }
      const unread = {
         kind: 'company' as const,
         slug: 'ghost',
         url: 'https://www.linkedin.com/company/ghost',
         name: 'Ghost',
         hiring: [],
      }
      const result = await scoreCompanies(context('score.company', { icpId: 'i1' }, [read, unread]))

      expect(mocks.recordCompanies).toHaveBeenCalledWith('u1', [
         expect.objectContaining({
            slug: 'acme',
            type: 'hiring',
         }),
      ])
      expect(savedMain()[0]).toMatchObject({
         slug: 'acme',
         tier: 'A',
      })
      expect(result.message).toContain('1 were not read')
   })
})

describe('bestPerCompany', () => {
   it('should keep the best of each company, one of each role first, and say why the rest went to Else', async () => {
      const people = [
         who('a1', {
            company: 'Acme',
            score: 90,
            tags: ['role:buyer'],
         }),
         who('a2', {
            company: 'ACME',
            score: 80,
            tags: ['role:buyer'],
         }),
         who('a3', {
            company: 'Acme',
            score: 70,
            tags: ['role:champion'],
         }),
         who('b1', {
            company: 'Beta',
            score: 10,
         }),
         who('n1'),
      ]
      const result = await bestPerCompany(context('process.bestPer', { perCompany: 2 }, people))
      const [key, rest] = savedElse()

      expect(key.nodeId).toBe('n1~else')
      expect(slugs(savedMain())).toEqual(['a1', 'a3', 'b1', 'n1'])
      expect(rest.map(item => [item.slug, item.result?.reason])).toEqual([['a2', 'More than 2 at this company.']])
      expect(result.message).toBe('5 in, 4 on, 1 to Else, 2 companies.')
   })
})

describe('spaceOut', () => {
   const acme = (slug: string, score: number) =>
      who(slug, {
         company: 'Acme',
         score,
      })
   const reasons = () => Object.fromEntries(savedElse()[1].map(item => [item.slug, item.result?.reason]))

   it('should let the best of a company through and hold the rest, when nothing happened there lately', async () => {
      await spaceOut(
         context('logic.spaceOut', {}, [acme('p1', 5), acme('p2', 9), who('p3', { company: 'Beta' }), who('p4')]),
         NOW
      )

      expect(slugs(savedMain())).toEqual(['p2', 'p3', 'p4'])
      expect(reasons()).toEqual({ p1: 'Another colleague goes first.' })
   })

   it('should hold the whole company back after a colleague was contacted lately, but not for the person themselves', async () => {
      mocks.ofCompanies.mockResolvedValue(
         new Map([
            [
               'acme',
               [
                  {
                     slug: 'colleague',
                     lastContactAt: daysAgo(1),
                     lastReplyAt: null,
                  },
                  {
                     slug: 'p2',
                     lastContactAt: daysAgo(0),
                     lastReplyAt: null,
                  },
               ],
            ],
         ])
      )

      await spaceOut(context('logic.spaceOut', {}, [acme('p1', 5), acme('p2', 9)]), NOW)

      expect(slugs(savedMain())).toEqual([])
      expect(reasons()).toEqual({
         p1: 'A colleague was contacted lately.',
         p2: 'A colleague was contacted lately.',
      })
   })

   it('should stop after a reply for the days asked for, and only when asked', async () => {
      mocks.ofCompanies.mockResolvedValue(
         new Map([
            [
               'acme',
               [
                  {
                     slug: 'colleague',
                     lastContactAt: null,
                     lastReplyAt: daysAgo(10),
                  },
               ],
            ],
         ])
      )

      await spaceOut(context('logic.spaceOut', {}, [acme('p1', 5)]), NOW)

      expect(reasons()).toEqual({ p1: 'A colleague replied.' })

      mocks.replaceItems.mockClear()
      await spaceOut(context('logic.spaceOut', { stopAfterReply: false }, [acme('p1', 5)]), NOW)

      expect(slugs(savedMain())).toEqual(['p1'])
   })
})

describe('stopContacting', () => {
   const mainResults = () =>
      Object.fromEntries(
         (mocks.replaceItems.mock.calls[0]?.[1] as Saved).map(item => [
            item.slug,
            `${item.result?.status}: ${item.result?.reason}`,
         ])
      )

   it('should stop the people who are not stopped yet, with the reason, and leave the others as they are', async () => {
      mocks.seenAmong.mockResolvedValue(new Set(['old']))

      const result = await stopContacting(
         context('output.doNotContact', { reason: 'Left the company' }, [who('new'), who('old')])
      )

      expect(mocks.stopContacting).toHaveBeenCalledWith('u1', ['new'])
      expect(mainResults()).toEqual({
         new: 'DONE: Left the company',
         old: 'SKIPPED: Already stopped.',
      })
      expect(result.message).toBe('2 in, 1 stopped, 1 already stopped.')
   })

   it('should stop no one in a preview, and say how many would be stopped', async () => {
      const result = await stopContacting(context('output.doNotContact', {}, [who('new')], true))

      expect(mocks.stopContacting).not.toHaveBeenCalled()
      expect(mainResults()).toEqual({ new: 'PLANNED: Stopped by a workflow' })
      expect(result.message).toBe('1 in, 1 would be stopped, 0 already stopped.')
   })
})
