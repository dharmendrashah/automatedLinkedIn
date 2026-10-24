import { describe, expect, it } from 'vitest'

import { createLinkedinProfile } from '.'

describe('linkedin-profile task', () => {
   const task = createLinkedinProfile({ baseUrl: 'https://www.linkedin.com' })

   it('should need an account and a proxy, and run one at a time per account', () => {
      expect(task.needs).toEqual({
         proxy: 'required',
         account: true,
      })
      expect(task.policy.oneAtATime).toBe('account')
   })

   it('should hold a second read back for half an hour, so the button cannot visit LinkedIn again at once', () => {
      expect(task.policy.cooldownMs).toBe(30 * 60 * 1000)
      expect(task.version).toBe(3)
   })
})
