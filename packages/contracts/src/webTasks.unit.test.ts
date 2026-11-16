import { describe, expect, it } from 'vitest'

import { WEB_TASK_REFUSED, webTaskRefusal } from './webTasks'

describe('webTaskRefusal', () => {
   it.each(['linkedin-invite', 'linkedin-reply', 'linkedin-message', 'linkedin-post', 'linkedin-engage'])(
      'should refuse %s, which always acts',
      task => {
         expect(webTaskRefusal(task, {})).toBe(WEB_TASK_REFUSED)
      }
   )

   it.each([
      'browser-detection',
      'linkedin-login',
      'linkedin-browse',
      'linkedin-messages',
      'linkedin-profile',
      'linkedin-view-profile',
      'linkedin-view-company',
   ])('should allow %s, which only reads or signs in', task => {
      expect(webTaskRefusal(task, undefined)).toBeNull()
   })

   it('should allow the requests task to read, and refuse it when it carries answers', () => {
      expect(webTaskRefusal('linkedin-invitations', {})).toBeNull()
      expect(webTaskRefusal('linkedin-invitations', { answers: [] })).toBeNull()
      expect(webTaskRefusal('linkedin-invitations', undefined)).toBeNull()
      expect(
         webTaskRefusal('linkedin-invitations', {
            answers: [
               {
                  id: 'x',
                  answer: 'ACCEPT',
               },
            ],
         })
      ).toBe(WEB_TASK_REFUSED)
   })

   it('should allow the connections task to read, and refuse it when it removes one', () => {
      expect(webTaskRefusal('linkedin-connections', {})).toBeNull()
      expect(webTaskRefusal('linkedin-connections', { remove: 'ada' })).toBe(WEB_TASK_REFUSED)
   })

   it('should refuse a task it does not know, so a new task starts closed', () => {
      expect(webTaskRefusal('linkedin-new-thing', {})).toBe(WEB_TASK_REFUSED)
   })
})
