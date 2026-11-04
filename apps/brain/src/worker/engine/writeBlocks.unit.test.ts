import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type PostItem } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context } from './context'
import { approvedTrigger, askMeFirst, writeWordsOnPosts } from './writeBlocks'

const mocks = vi.hoisted(() => ({
   room: vi.fn(),
   previewRoom: vi.fn(),
   record: vi.fn(),
   rules: vi.fn(),
   queue: vi.fn(),
   itemsOf: vi.fn(),
   voice: vi.fn(),
   seenAmong: vi.fn(),
   replaceItems: vi.fn(),
   configured: vi.fn(),
   writeWithAi: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   ...(await vi.importActual<object>('core/linkedInUrl')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))
vi.mock('core/aiModel', () => ({
   aiConfigured: mocks.configured,
   writeWithAi: mocks.writeWithAi,
}))

vi.mock('database', () => ({
   AiBudgetService: {
      room: mocks.room,
      previewRoom: mocks.previewRoom,
      record: mocks.record,
   },
   DraftService: {
      rules: mocks.rules,
      queue: mocks.queue,
      itemsOf: mocks.itemsOf,
   },
   VoiceService: { get: mocks.voice },
   WorkflowListService: { seenAmong: mocks.seenAmong },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   IcpService: {},
   WalletService: {},
   VisitPoolService: {},
   floorMicros: () => 0,
}))

const text = 'We cut our onboarding from 14 days to 3 by removing the kickoff call and the long setup form.'

const post = (id: number, fields: Partial<PostItem> = {}): PostItem => ({
   kind: 'post',
   slug: `${id}`,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:75201957212168${String(id).padStart(5, '0')}`,
   postId: null,
   author: `https://www.linkedin.com/in/author-${id}`,
   preview: {
      text,
      author: {
         name: 'Ada Lovelace',
         url: null,
         avatar: null,
         headline: 'Founder',
         followers: null,
         isCompany: false,
      },
      reactions: null,
      comments: null,
      shares: null,
      postedAt: null,
      media: null,
      articleUrl: null,
      repostNote: null,
   },
   ...fields,
})

const graph = (type: Graph['nodes'][number]['type'], config: Graph['nodes'][number]['config']): Graph => ({
   nodes: [
      {
         id: 'n1',
         type,
         config,
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
})

const context = (
   type: Graph['nodes'][number]['type'],
   config: Graph['nodes'][number]['config'],
   inputs: unknown[],
   preview = false,
   input: unknown = null
) => {
   const built = graph(type, config)

   return {
      run: {
         id: 'run-1',
         userId: 'u1',
         workflowId: 'w1',
         input,
      },
      graph: built,
      node: built.nodes[0],
      step: { id: 's1' },
      at: {
         runId: 'run-1',
         nodeId: 'n1',
         round: 0,
      },
      inputs,
      preview,
      deps: { log: { info: vi.fn() } },
   } as unknown as Context
}

type Saved = {
   slug: string
   written?: string
   writtenMode?: string
   result: { status: string; reason: string | null }
   facts?: Record<string, unknown>
}

const saved = (call: number) => (mocks.replaceItems.mock.calls[call]?.[1] ?? []) as Saved[]
const aside = (items: Saved[]) => items.map(({ slug, result }) => `${slug}:${result.reason}`)

const ai = {
   how: 'ai',
   voice: 'v1',
}
const voice = {
   id: 'v1',
   name: 'Agency voice',
   about: '',
   tone: 'friendly',
   language: '',
   avoid: ['guarantee'],
   rules: '',
}
const wrote = (words: string, cost = 140) => ({
   status: 'WRITTEN',
   words,
   usage: {
      model: 'fake',
      inputTokens: 1_000,
      outputTokens: 100,
      costMicros: cost,
   },
})

beforeEach(() => {
   vi.resetAllMocks()
   mocks.configured.mockReturnValue(true)
   mocks.room.mockResolvedValue('OK')
   mocks.previewRoom.mockResolvedValue(true)
   mocks.rules.mockResolvedValue({
      avoid: [],
      recent: [],
   })
   mocks.voice.mockResolvedValue(voice)
   mocks.seenAmong.mockResolvedValue(new Set())
})

describe('writeWordsOnPosts from the texts', () => {
   it('should put a text on each post in turn, fill the author name, and send what is not a post to Else', async () => {
      const result = await writeWordsOnPosts(
         context('process.write', { texts: ['First for {author_first_name}.', 'Second for {author_first_name}.'] }, [
            post(1),
            post(2),
            {
               kind: 'company',
               slug: 'acme',
               url: 'https://x',
               name: null,
               hiring: [],
            },
         ])
      )
      const written = saved(1)

      expect(written.map(item => item.written)).toHaveLength(2)
      expect(new Set(written.map(item => item.written)).size).toBe(2)
      expect(written.every(item => item.written?.includes('Ada'))).toBe(true)
      expect(written.every(item => item.writtenMode === 'TEXTS')).toBe(true)
      expect(aside(saved(0))).toEqual(['acme:Only posts get words so far.'])
      expect(result.message).toContain('3 in, 2 written, 1 to Else (1 not a post)')
      expect(mocks.writeWithAi).not.toHaveBeenCalled()
   })

   it('should leave a post whose text fails a check to Else as not suitable', async () => {
      await writeWordsOnPosts(context('process.write', { texts: ['Read more at https://example.com'] }, [post(1)]))

      expect(aside(saved(0))).toEqual(['1:Not suitable.'])
      expect(saved(1)).toEqual([])
   })
})

describe('writeWordsOnPosts with AI', () => {
   it('should write, check the words, book the call and carry what the inbox needs', async () => {
      mocks.writeWithAi.mockResolvedValue(wrote('Which step did you remove first?'))

      const result = await writeWordsOnPosts(context('process.write', ai, [post(1)]))
      const [item] = saved(1)

      expect(item).toMatchObject({
         written: 'Which step did you remove first?',
         writtenMode: 'AI',
         facts: {
            'write.voice': 'v1',
            'write.model': 'fake',
            'write.costMicros': 140,
         },
      })
      expect(mocks.record).toHaveBeenCalledWith(
         'u1',
         expect.objectContaining({
            amountMicros: 140,
            label: 'AI comments',
            preview: false,
         })
      )
      expect(result.message).toContain('AI cost $0.000')
   })

   it.each([
      ['AI is not set up', () => mocks.configured.mockReturnValue(false), 'AI is not set up.'],
      ['the switch is off', () => mocks.room.mockResolvedValue('PAUSED'), 'Paused by the admin.'],
      ['a cap is reached', () => mocks.room.mockResolvedValue('LIMIT'), 'AI limit reached.'],
      ['the voice is gone', () => mocks.voice.mockResolvedValue(null), 'AI is not set up.'],
   ])('should send every post to Else, and not call the model, when %s', async (_name, setup, reason) => {
      setup()

      await writeWordsOnPosts(context('process.write', ai, [post(1), post(2)]))

      expect(aside(saved(0))).toEqual([`1:${reason}`, `2:${reason}`])
      expect(mocks.writeWithAi).not.toHaveBeenCalled()
   })

   it('should skip a short post, a person on Do not contact, and what the model will not answer', async () => {
      mocks.seenAmong.mockResolvedValue(new Set(['author-2']))
      mocks.writeWithAi.mockResolvedValueOnce({
         status: 'SKIPPED',
         reason: 'SENSITIVE',
         usage: wrote('x').usage,
      })

      await writeWordsOnPosts(
         context('process.write', ai, [
            post(1, {
               preview: {
                  ...(post(1).preview as object),
                  text: 'Too short',
               } as PostItem['preview'],
            }),
            post(2),
            post(3),
         ])
      )

      expect(aside(saved(0))).toEqual(['1:Too short to answer.', '2:On Do not contact.', '3:Sensitive, so skipped.'])
      expect(mocks.writeWithAi).toHaveBeenCalledTimes(1)
      expect(mocks.record).toHaveBeenCalledTimes(1)
   })

   it('should drop words that fail a check or repeat an earlier piece, and a failed call costs nothing', async () => {
      mocks.rules.mockResolvedValue({
         avoid: [],
         recent: ['Which step did you remove first?'],
      })
      mocks.writeWithAi
         .mockResolvedValueOnce(wrote('Which step did you remove first?'))
         .mockResolvedValueOnce(wrote('A guarantee of results for everyone'))
         .mockResolvedValueOnce({ status: 'FAILED' })

      await writeWordsOnPosts(context('process.write', ai, [post(1), post(2), post(3)]))

      expect(aside(saved(0))).toEqual(['1:Too like an earlier text.', '2:Not suitable.', '3:AI did not answer.'])
      expect(mocks.record).toHaveBeenCalledTimes(2)
   })

   it('should write for at most the number set, and for at most three posts in a preview', async () => {
      mocks.writeWithAi
         .mockResolvedValueOnce(wrote('Which step went first?'))
         .mockResolvedValue(wrote('What was the hardest part?'))

      await writeWordsOnPosts(
         context(
            'process.write',
            {
               ...ai,
               atMost: 1,
            },
            [post(1), post(2)]
         )
      )

      expect(mocks.writeWithAi).toHaveBeenCalledTimes(1)
      expect(aside(saved(0))).toEqual(['2:AI limit reached.'])

      vi.mocked(mocks.writeWithAi).mockClear()
      mocks.replaceItems.mockClear()

      await writeWordsOnPosts(context('process.write', ai, [post(1), post(2), post(3), post(4), post(5)], true))

      expect(mocks.writeWithAi).toHaveBeenCalledTimes(3)
      expect(mocks.record).toHaveBeenLastCalledWith('u1', expect.objectContaining({ preview: true }))
   })
})

describe('askMeFirst', () => {
   const written = (id: number, fields: Partial<PostItem> = {}) =>
      post(id, {
         written: `Words for ${id}?`,
         writtenMode: 'AI',
         facts: {
            'write.maxChars': 240,
            'write.voice': 'v1',
         },
         ...fields,
      })

   it('should put posts with words in the inbox, say why the rest are not, and pass nothing on', async () => {
      mocks.seenAmong.mockResolvedValue(new Set(['author-3']))
      mocks.queue.mockImplementation(
         async (_user, _origin, _limits, _kind, drafts: Array<{ targetKey: string }>) =>
            new Map(drafts.map(({ targetKey }, at) => [targetKey, at === 0 ? 'QUEUED' : 'OVER_DAY']))
      )

      const result = await askMeFirst(context('logic.approve', {}, [written(1), written(2), written(3), post(4)]))

      expect(mocks.queue).toHaveBeenCalledWith(
         'u1',
         {
            workflowId: 'w1',
            runId: 'run-1',
            nodeId: 'n1',
         },
         {
            perDay: 10,
            keepWaiting: 20,
            expireHours: 48,
         },
         'COMMENT',
         [
            expect.objectContaining({
               slug: 'author-1',
               targetKey: 'activity:7520195721216800001',
               words: 'Words for 1?',
               mode: 'AI',
               maxChars: 240,
               voiceId: 'v1',
            }),
            expect.objectContaining({ targetKey: 'activity:7520195721216800002' }),
         ],
         expect.any(Date),
         false
      )
      expect(aside(saved(0)).sort()).toEqual([
         "2:Over today's limit.",
         '3:On Do not contact.',
         '4:No words to approve.',
      ])
      expect(saved(1)).toEqual([])
      expect(result.message).toContain('1 in your inbox, 3 to Else')
   })

   it('should queue nothing in a preview, only say what would go in', async () => {
      mocks.queue.mockResolvedValue(new Map([['activity:7520195721216800001', 'QUEUED']]))

      const result = await askMeFirst(context('logic.approve', {}, [written(1)], true))

      expect(mocks.queue.mock.calls[0]?.[6]).toBe(true)
      expect(result.message).toContain('A preview puts nothing in your inbox: 1 would go in')
   })
})

describe('approvedTrigger', () => {
   it('should give the approved posts with their final words, rebuilt from the drafts', async () => {
      mocks.itemsOf.mockResolvedValue([
         {
            item: post(1),
            words: 'Final words?',
            mode: 'AI',
         },
      ])

      const result = await approvedTrigger(context('trigger.approved', {}, [], false, { drafts: ['d1'] }))
      const [item] = (mocks.replaceItems.mock.calls[0]?.[1] ?? []) as Saved[]

      expect(mocks.itemsOf).toHaveBeenCalledWith('u1', ['d1'])
      expect(item).toMatchObject({
         slug: '1',
         written: 'Final words?',
         writtenMode: 'AI',
         result: { status: 'APPROVED' },
      })
      expect(result.itemsOut).toBe(1)
   })

   it('should take nothing in a run no approval started', async () => {
      const result = await approvedTrigger(context('trigger.approved', {}, []))

      expect(mocks.itemsOf).not.toHaveBeenCalled()
      expect(result.message).toContain('No approved words started this run')
   })
})
