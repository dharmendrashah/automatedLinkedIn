import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type GraphNode } from '@automatedLinkedIn/contracts'

import { type Context } from './context'
import { classifyItems, detectChanges, findThePattern } from './readBlocks'

const mocks = vi.hoisted(() => ({
   configured: vi.fn(),
   callModel: vi.fn(),
   room: vi.fn(),
   previewRoom: vi.fn(),
   record: vi.fn(),
   forSlugs: vi.fn(),
   recordPeople: vi.fn(),
   replaceItems: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: (values: string[]) => values,
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))
vi.mock('core/aiModel', () => ({
   aiConfigured: mocks.configured,
   callModel: mocks.callModel,
   aiPrice: () => ({
      inputMicros: 1_000_000,
      outputMicros: 2_000_000,
   }),
}))

vi.mock('database', () => ({
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
   AiBudgetService: {
      room: mocks.room,
      previewRoom: mocks.previewRoom,
      record: mocks.record,
   },
   PersonSnapshotService: { forSlugs: mocks.forSlugs },
   SignalService: { recordPeople: mocks.recordPeople },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
}))

const LABELS = ['asking: Asks for a tool or advice', 'complaint: Complains about the problem']

const context = (type: GraphNode['type'], config: GraphNode['config'], inputs: unknown[], preview = false) =>
   ({
      run: {
         id: 'r1',
         userId: 'u1',
         workflowId: 'w1',
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
      at: {
         runId: 'r1',
         nodeId: 'n1',
         round: 0,
      },
      inputs,
      preview,
      deps: {},
   }) as unknown as Context

type Saved = Array<{
   slug: string
   tags?: string[]
   facts?: Record<string, unknown>
   result?: { reason: string | null }
}>

const savedElse = () => mocks.replaceItems.mock.calls[0]?.[1] as Saved
const savedMain = () => mocks.replaceItems.mock.calls[1]?.[1] as Saved

const post = (slug: string, text: string | null) => ({
   kind: 'post' as const,
   slug,
   url: `https://www.linkedin.com/posts/${slug}`,
   postId: null,
   preview: text === null ? null : { text },
})

const who = (slug: string, headline: string | null = null) =>
   person({
      slug,
      url: `https://www.linkedin.com/in/${slug}`,
      headline,
   })

const answer = (label: string, confidence: number) =>
   mocks.callModel.mockResolvedValueOnce({
      output: {
         label,
         confidence,
      },
      model: 'm',
      inputTokens: 100,
      outputTokens: 10,
   })

beforeEach(() => {
   vi.resetAllMocks()
   mocks.configured.mockReturnValue(true)
   mocks.room.mockResolvedValue('OK')
   mocks.previewRoom.mockResolvedValue(true)
   mocks.forSlugs.mockResolvedValue(new Map())
})

describe('classifyItems', () => {
   it('should label what the AI is sure about, tag people, send the rest to Else with why, and book each call', async () => {
      answer('asking', 90)
      answer('complaint', 50)
      mocks.callModel.mockRejectedValueOnce(new Error('down'))

      const result = await classifyItems(
         context(
            'process.classify',
            {
               labels: LABELS,
               read: 'auto',
            },
            [post('p1', 'Any tool tips?'), who('ada', 'Hates cold email'), post('p2', 'a third'), post('p3', null)]
         )
      )

      expect(
         savedMain().map(({ slug, facts }) => [slug, facts?.['item.label'], facts?.['item.labelConfidence']])
      ).toEqual([['p1', 'asking', 90]])
      expect(Object.fromEntries(savedElse().map(item => [item.slug, item.result?.reason]))).toEqual({
         ada: 'Not sure.',
         p2: 'AI did not answer.',
         p3: 'Nothing to read.',
      })
      expect(mocks.record).toHaveBeenCalledTimes(2)
      expect(mocks.record).toHaveBeenCalledWith(
         'u1',
         expect.objectContaining({
            label: 'AI labels',
            amountMicros: 120,
            preview: false,
         })
      )
      expect(result.message).toBe('4 in, 1 labelled (1 asking), 3 to Else. AI cost $0.000.')
   })

   it('should tag a labelled person label:name unless asked not to, and read the kind its setting names', async () => {
      answer('asking', 80)

      await classifyItems(
         context(
            'process.classify',
            {
               labels: LABELS,
               read: 'headline',
            },
            [who('ada', 'Looking for a tool'), post('p1', 'x')]
         )
      )

      expect(savedMain()[0].tags).toEqual(['label:asking'])
      expect(savedElse().map(({ slug, result }) => [slug, result?.reason])).toEqual([['p1', 'Nothing to read.']])

      mocks.replaceItems.mockClear()
      answer('asking', 80)
      await classifyItems(
         context(
            'process.classify',
            {
               labels: LABELS,
               alsoTag: false,
            },
            [who('ada', 'Looking for a tool')]
         )
      )

      expect(savedMain()[0].tags).toEqual([])
   })

   it('should ask nothing and say why when the AI is not set up, is paused or is over its limit', async () => {
      mocks.configured.mockReturnValue(false)
      await classifyItems(context('process.classify', { labels: LABELS }, [post('p1', 'x')]))

      expect(savedElse()[0].result?.reason).toBe('AI is not set up.')

      for (const [room, reason] of [
         ['PAUSED', 'Paused by the admin.'],
         ['LIMIT', 'AI limit reached.'],
      ]) {
         mocks.configured.mockReturnValue(true)
         mocks.room.mockResolvedValue(room)
         mocks.replaceItems.mockClear()
         await classifyItems(context('process.classify', { labels: LABELS }, [post('p1', 'x')]))

         expect(savedElse()[0].result?.reason).toBe(reason)
      }

      expect(mocks.callModel).not.toHaveBeenCalled()
   })

   it('should read at most the number asked for a run, three in a preview, and book a preview as one', async () => {
      for (let index = 0; index < 5; index += 1) {
         answer('asking', 99)
      }

      const posts = Array.from({ length: 5 }, (_, index) => post(`p${index}`, 'text'))

      await classifyItems(
         context(
            'process.classify',
            {
               labels: LABELS,
               atMost: 2,
            },
            posts
         )
      )

      expect(mocks.callModel).toHaveBeenCalledTimes(2)
      expect(savedElse().map(item => item.result?.reason)).toEqual(Array(3).fill('AI limit reached.'))

      mocks.callModel.mockClear()
      mocks.replaceItems.mockClear()
      await classifyItems(
         context(
            'process.classify',
            {
               labels: LABELS,
               atMost: 100,
            },
            posts,
            true
         )
      )

      expect(mocks.callModel).toHaveBeenCalledTimes(3)
      expect(mocks.record).toHaveBeenLastCalledWith('u1', expect.objectContaining({ preview: true }))
   })

   it('should read each item once even when it arrives twice', async () => {
      answer('asking', 99)

      await classifyItems(context('process.classify', { labels: LABELS }, [post('p1', 'x'), post('p1', 'x')]))

      expect(mocks.callModel).toHaveBeenCalledTimes(1)
   })
})

const snapshot = (title: string, start: string | null, school = 'IIT') => ({
   name: 'x',
   headline: null,
   location: 'Pune, India',
   country: 'India',
   about: null,
   photo: null,
   followers: null,
   connections: null,
   openToWork: false,
   hiring: false,
   experience: [
      {
         title,
         company: 'Acme',
         companyUrl: null,
         location: null,
         start,
         end: null,
         description: null,
      },
   ],
   education: [
      {
         school,
         degree: null,
         field: null,
         start: null,
         end: null,
      },
   ],
   skills: [],
})

describe('findThePattern', () => {
   it('should sum up the most common values and pass the people on unchanged', async () => {
      const people = ['a', 'b', 'c', 'd', 'e'].map(slug => who(slug))

      mocks.forSlugs.mockResolvedValue(new Map(people.map(({ slug }) => [slug, snapshot('Head of Growth', null)])))

      const result = await findThePattern(
         context(
            'process.pattern',
            {
               parts: ['titles', 'schools'],
               top: 3,
            },
            people
         )
      )

      expect(mocks.replaceItems.mock.calls[0]?.[1]).toHaveLength(5)
      expect(result.message).toBe('5 people, 5 with a full profile. Titles: Head of Growth 100%. Schools: IIT 100%.')
   })

   it('should say a pattern needs more profiles when fewer than five are stored', async () => {
      const people = [who('a'), who('b')]

      mocks.forSlugs.mockResolvedValue(new Map([['a', snapshot('Founder', null)]]))

      const result = await findThePattern(context('process.pattern', {}, people))

      expect(result.message).toBe('2 people, 1 with a full profile. Too few to see a pattern. Read more profiles.')
      expect(mocks.replaceItems.mock.calls[0]?.[1]).toHaveLength(2)
   })
})

describe('detectChanges', () => {
   const NOW = new Date('2026-11-01T00:00:00Z')

   it('should keep people with a new role, say why the rest went to Else, and write a signal dated the day the role started', async () => {
      mocks.forSlugs.mockResolvedValue(
         new Map([
            ['new', snapshot('Head of Growth', '9/2026')],
            ['old', snapshot('Founder', '2019')],
         ])
      )

      const result = await detectChanges(
         context('collect.changes', { withinDays: 90 }, [who('new'), who('old'), who('unread')]),
         NOW
      )

      expect(savedMain().map(({ slug, facts }) => [slug, facts])).toEqual([
         [
            'new',
            {
               'change.kind': 'new_role',
               'change.role': 'Head of Growth',
               'change.since': '2026-09-01',
            },
         ],
      ])
      expect(Object.fromEntries(savedElse().map(item => [item.slug, item.result?.reason]))).toEqual({
         old: 'No change.',
         unread: 'Never read.',
      })
      expect(mocks.recordPeople).toHaveBeenCalledWith('u1', [
         {
            slug: 'new',
            type: 'jobchange',
            via: '2026-09-01',
            at: new Date('2026-09-01T00:00:00Z'),
         },
      ])
      expect(result.message).toBe('3 in, 1 with a new role, 1 no change, 1 never read.')
   })

   it('should write no signal in a preview', async () => {
      mocks.forSlugs.mockResolvedValue(new Map([['new', snapshot('Head of Growth', '9/2026')]]))

      await detectChanges(context('collect.changes', {}, [who('new')], true), NOW)

      expect(mocks.recordPeople).not.toHaveBeenCalled()
      expect(savedMain()).toHaveLength(1)
   })
})
