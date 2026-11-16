import { describe, expect, it } from 'vitest'

import * as contract from '@automatedLinkedIn/contracts'

import { WEB_TASK_REFUSED, webTaskRefusal } from './web-tasks'

describe('web tasks', () => {
   it('keeps the refusal sentence and the lists equal to the contract', () => {
      expect(WEB_TASK_REFUSED).toBe(contract.WEB_TASK_REFUSED)

      const inputs = [undefined, {}, { answers: [] }, { answers: [{ id: 'x' }] }, { remove: 'ada' }]
      const tasks = [...contract.WEB_READ_TASKS, ...Object.keys(contract.WEB_ACT_KEYS), 'linkedin-invite', 'unknown']

      for (const task of tasks) {
         for (const input of inputs) {
            expect(webTaskRefusal(task, input)).toBe(contract.webTaskRefusal(task, input))
         }
      }
   })

   it('says a finished act task cannot be run again, and a read task can', () => {
      expect(webTaskRefusal('linkedin-invite', {})).toBe(WEB_TASK_REFUSED)
      expect(webTaskRefusal('linkedin-browse', {})).toBeNull()
   })
})
