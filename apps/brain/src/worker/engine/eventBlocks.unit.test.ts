import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph, sampleEvent } from '@automatedLinkedIn/contracts'

import { type Context } from './context'
import { eventTrigger, ifEvent, messageMood } from './eventBlocks'

const mocks = vi.hoisted(() => ({
   replaceItems: vi.fn(),
   eventOfDelivery: vi.fn(),
   envelopeOf: vi.fn(),
   itemsOf: vi.fn(),
   latestId: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', () => ({
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   EventDispatchService: { eventOfDelivery: mocks.eventOfDelivery },
   TaskEventService: {
      envelopeOf: mocks.envelopeOf,
      itemsOf: mocks.itemsOf,
      latestId: mocks.latestId,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const node = (type: Graph['nodes'][number]['type'], config: Graph['nodes'][number]['config'] = {}) => ({
   id: 'n',
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const context = (
   type: Graph['nodes'][number]['type'],
   config: Graph['nodes'][number]['config'],
   inputs: Context['inputs'],
   input: unknown = { delivery: 'd1' }
) =>
   ({
      run: {
         id: 'r1',
         userId: 'u1',
         input,
      },
      graph: {
         nodes: [],
         edges: [],
      },
      node: node(type, config),
      step: {
         id: 's1',
         round: 0,
      },
      at: {
         runId: 'r1',
         nodeId: 'n',
         round: 0,
      },
      inputs,
      preview: false,
      deps: {},
   }) as unknown as Context

const withFacts = (slug: string, facts: Record<string, string | number | boolean | null>) =>
   person({
      slug,
      url: `https://www.linkedin.com/in/${slug}`,
      facts,
   })

const savedAt = (call: number) => mocks.replaceItems.mock.calls[call]?.[1] as { slug: string }[]

describe('If the event says', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.eventOfDelivery.mockResolvedValue('e1')
      mocks.envelopeOf.mockResolvedValue(sampleEvent('linkedin-invite', 'after'))
   })

   it('should pass what matches and keep the rest, including what is not known, for the Else', async () => {
      const inputs = [
         withFacts('no-note', { 'item.noteSent': false }),
         withFacts('note', { 'item.noteSent': true }),
         withFacts('unknown', { 'item.noteSent': null }),
      ]
      const result = await ifEvent(
         context(
            'logic.ifEvent',
            {
               fact: 'item.noteSent',
               is: 'is',
               value: 'false',
            },
            inputs
         )
      )

      expect(result).toMatchObject({
         itemsIn: 3,
         itemsOut: 1,
      })
      // The Else keeps the rest first, the output second.
      expect(savedAt(0).map(({ slug }) => slug)).toEqual(['note', 'unknown'])
      expect(savedAt(1).map(({ slug }) => slug)).toEqual(['no-note'])
   })

   it('should find what is not known when asked to', async () => {
      const inputs = [withFacts('known', { 'item.noteSent': true }), withFacts('unknown', { 'item.noteSent': null })]

      await ifEvent(
         context(
            'logic.ifEvent',
            {
               fact: 'item.noteSent',
               is: 'unknown',
               value: '',
            },
            inputs
         )
      )

      expect(savedAt(1).map(({ slug }) => slug)).toEqual(['unknown'])
   })

   it('should read facts of the event too, and match any condition when asked', async () => {
      const inputs = [withFacts('a', {})]

      await ifEvent(
         context(
            'logic.ifEvent',
            {
               match: 'any',
               fact: 'event.verdict',
               is: 'is',
               value: 'PARTIAL',
               fact2: 'event.startedBy',
               is2: 'is',
               value2: 'automation',
            },
            inputs
         )
      )

      expect(savedAt(1).map(({ slug }) => slug)).toEqual(['a'])
   })
})

describe('Read the mood of a message', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should keep a mood and a fixed reason on each conversation and leave other items alone', async () => {
      const conversation = {
         kind: 'conversation' as const,
         slug: 'c1',
         url: 'https://www.linkedin.com/messaging/thread/1/',
         personSlug: null,
         name: 'Ada',
         headline: null,
         lastText: 'Not interested, thanks',
         lastAt: null,
         lastFrom: 'THEM' as const,
         unread: true,
      }
      const ada = person({
         slug: 'ada',
         url: 'https://www.linkedin.com/in/ada',
      })

      await messageMood(context('process.messageMood', {}, [conversation, ada]))

      const [saved, untouched] = savedAt(0) as unknown as { facts?: Record<string, unknown> }[]

      expect(saved.facts).toEqual({
         'item.mood': 'negative',
         'item.moodReason': 'Words that mean no.',
      })
      expect(untouched.facts).toBeUndefined()
   })
})

describe('trigger blocks', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should give the items of the event that started the run', async () => {
      mocks.eventOfDelivery.mockResolvedValue('e1')
      mocks.itemsOf.mockResolvedValue([withFacts('ada', { 'item.outcome': 'SENT' })])

      const result = await eventTrigger(
         context(
            'trigger.taskEvent',
            {
               phase: 'after',
               task: '',
            },
            []
         )
      )

      expect(mocks.itemsOf).toHaveBeenCalledWith('e1')
      expect(result).toMatchObject({ itemsOut: 1 })
      expect(result.message).toBeUndefined()
   })

   it('should take the newest event of its kind for a run by hand, and say so when there is none', async () => {
      mocks.latestId.mockResolvedValue(null)

      const result = await eventTrigger(
         context(
            'trigger.taskEvent',
            {
               phase: 'after',
               task: 'linkedin-invite',
            },
            [],
            null
         )
      )

      expect(mocks.latestId).toHaveBeenCalledWith('u1', 'after', 'linkedin-invite')
      expect(result).toMatchObject({ itemsOut: 0 })
      expect(result.message).toContain('No event')
   })
})
