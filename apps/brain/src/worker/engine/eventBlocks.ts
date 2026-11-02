import { z } from 'zod'

import { type ItemFacts, type WorkflowItemData } from 'core'

import { EventDispatchService, EventToolsService, HookService, TaskEventService, WorkflowRunService } from 'database'

import {
   EVENT_CONDITION_ROWS,
   type FactCondition,
   type FactValue,
   conditionMatches,
   eventFactsOf,
   eventTriggerOf,
   moodOf,
} from '@automatedLinkedIn/contracts'

import { type Context, type StepResult, configOf, elseKey, keepItems } from './context'

// The blocks that work with events (.plan/workflow-events-and-hooks.md): the two triggers that start a run from a task event, "If the event
// says" and the mood of a message. None of them sends anything.

const inputSchema = z.object({
   delivery: z.string().optional(),
   deliveries: z.array(z.string()).optional(),
   event: z.string().optional(),
})

// The event this run started from: the one its delivery is about, or the one the owner picked for a preview or a replay; none for a run
// by hand.
const eventIdOf = async (ctx: Context) => {
   const { delivery, event } = inputSchema.safeParse(ctx.run.input).data ?? {}

   if (event) {
      return EventToolsService.ownEvent(event, ctx.run.userId)
   }

   return delivery ? EventDispatchService.eventOfDelivery(delivery, ctx.run.userId) : null
}

// The event as JSON, with the task's own input, when an event started this run; undefined otherwise.
export const runEvent = async (ctx: Context) => {
   const eventId = await eventIdOf(ctx)

   return eventId ? ((await TaskEventService.envelopeOf(eventId, { withInput: true })) ?? undefined) : undefined
}

// A trigger gives what its event is about, each person once when a collecting trigger folded several events together. A run by hand or a
// preview takes the newest event the trigger would have taken.
export const eventTrigger = async (ctx: Context): Promise<StepResult> => {
   const trigger = eventTriggerOf(ctx.node)
   const { deliveries } = inputSchema.safeParse(ctx.run.input).data ?? {}
   const folded =
      deliveries && deliveries.length > 1
         ? await EventDispatchService.eventsOfDeliveries(deliveries, ctx.run.userId)
         : []
   const eventId =
      (await eventIdOf(ctx)) ??
      (trigger ? await TaskEventService.latestId(ctx.run.userId, trigger.phase, trigger.task) : null)
   const found = (
      await Promise.all((folded.length > 0 ? folded : eventId ? [eventId] : []).map(id => TaskEventService.itemsOf(id)))
   ).flat()
   const items = [...new Map(found.map(item => [`${item.kind}:${item.slug}`, item])).values()]
   const result = await keepItems(ctx, items, 0)

   return eventId
      ? result
      : {
           ...result,
           message: 'No event of this kind has happened yet, so there was nothing to take.',
        }
}

// A hook run starts with what its block had at that moment.
export const hookTrigger = async (ctx: Context): Promise<StepResult> =>
   keepItems(ctx, await HookService.itemsOf(ctx.run), 0)

const conditionsOf = (config: Record<string, unknown>): FactCondition[] =>
   Array.from({ length: EVENT_CONDITION_ROWS }, (_unused, index) => index + 1).flatMap((row): FactCondition[] => {
      const key = (name: string) => (row === 1 ? name : `${name}${row}`)
      const fact = config[key('fact')]
      const is = config[key('is')]
      const value = config[key('value')]

      return typeof fact === 'string' && fact !== '' && (is === 'is' || is === 'isNot' || is === 'unknown')
         ? [
              {
                 fact,
                 is,
                 value: typeof value === 'string' ? value : '',
              },
           ]
         : []
   })

// What the event and the item say, by `scope.key`.
const factsFor = (event: Record<string, FactValue>, item: WorkflowItemData): Record<string, FactValue> => ({
   ...event,
   ...(item.facts ?? {}),
})

// Passes on what the event says matches; the rest is kept aside for an Else after it.
export const ifEvent = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const conditions = conditionsOf(config)
   const eventId = await eventIdOf(ctx)
   const envelope = eventId ? await TaskEventService.envelopeOf(eventId) : null
   const event = envelope ? eventFactsOf(envelope) : {}
   const test = config.match === 'any' ? 'some' : 'every'
   const passed: WorkflowItemData[] = []
   const rest: WorkflowItemData[] = []

   for (const item of ctx.inputs) {
      const facts = factsFor(event, item)

      ;(conditions[test](condition => conditionMatches(condition, facts)) ? passed : rest).push(item)
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), rest)

   return keepItems(ctx, passed, ctx.inputs.length)
}

// Reads the newest words of each conversation by rules and keeps the mood, with a fixed reason, on the item.
export const messageMood = async (ctx: Context): Promise<StepResult> => {
   const read = ctx.inputs.map((item): WorkflowItemData => {
      if (item.kind !== 'conversation') {
         return item
      }

      const { mood, reason } = moodOf(item.lastText ?? '')
      const facts: ItemFacts = {
         ...(item.facts ?? {}),
         'item.mood': mood,
         'item.moodReason': reason,
      }

      return {
         ...item,
         facts,
      }
   })

   return keepItems(ctx, read, ctx.inputs.length)
}
