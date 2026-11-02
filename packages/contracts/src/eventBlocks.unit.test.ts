import { describe, expect, it } from 'vitest'

import { type Graph, type GraphNode, errorsOf, eventTriggerOf, isFired, validateGraph } from './workflow'

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

describe('event trigger blocks', () => {
   it('should read the settings of a task event trigger, with defaults', () => {
      expect(eventTriggerOf(node('t', 'trigger.taskEvent', { task: 'linkedin-invite' }))).toMatchObject({
         phase: 'after',
         task: 'linkedin-invite',
         accounts: [],
         startedBy: ['owner', 'automation', 'workflow', 'retry', 'event'],
         ownTasks: false,
         maxPerHour: 30,
      })
   })

   it('should read the messages trigger as the finished messages read', () => {
      expect(eventTriggerOf(node('m', 'trigger.messageArrived', { maxPerHour: 5 }))).toMatchObject({
         phase: 'after',
         task: 'linkedin-messages',
         maxPerHour: 5,
      })
   })

   it('should give nothing for any other block or for settings that do not read', () => {
      expect(eventTriggerOf(node('x', 'trigger.manual'))).toBeNull()
      expect(eventTriggerOf(node('t', 'trigger.taskEvent', { maxPerHour: 9_999 }))).toBeNull()
   })

   it('should fire only the event triggers for an event run, and every trigger when none of that kind exists', () => {
      const graph: Graph = {
         nodes: [node('t', 'trigger.taskEvent'), node('s', 'trigger.schedule')],
         edges: [],
      }

      expect(isFired(graph, 'EVENT', 'trigger.taskEvent')).toBe(true)
      expect(isFired(graph, 'EVENT', 'trigger.schedule')).toBe(false)
   })
})

describe('the account of the event', () => {
   const act = node('send', 'account.sendMessage', {
      accountMode: 'event',
      text: 'Hi',
      actForReal: false,
   })

   it('should be an error in a workflow that cannot start from an event', () => {
      const graph: Graph = {
         nodes: [node('t', 'trigger.manual'), act],
         edges: [
            {
               from: 't',
               to: 'send',
            },
         ],
      }

      expect(errorsOf(validateGraph(graph)).map(({ message }) => message)).toContain(
         'Send message uses the account of the event, so the workflow needs a trigger that starts from an event.'
      )
   })

   it('should need no "Select accounts" in a workflow that starts from an event', () => {
      const graph: Graph = {
         nodes: [node('t', 'trigger.taskEvent'), act],
         edges: [
            {
               from: 't',
               to: 'send',
            },
         ],
      }

      expect(errorsOf(validateGraph(graph))).toEqual([])
   })
})

describe('If the event says', () => {
   it('should need a fact to look at', () => {
      const graph: Graph = {
         nodes: [node('t', 'trigger.taskEvent'), node('if', 'logic.ifEvent')],
         edges: [
            {
               from: 't',
               to: 'if',
            },
         ],
      }

      expect(errorsOf(validateGraph(graph)).map(({ message }) => message)).toContain(
         'If the event says: pick a fact to look at.'
      )
   })
})
