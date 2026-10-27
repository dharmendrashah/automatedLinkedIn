import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLinkedinProfile } from '.'

const mocks = vi.hoisted(() => ({ readProfile: vi.fn() }))

vi.mock('./read', () => ({ readProfile: mocks.readProfile }))

describe('linkedin-profile task', () => {
   const task = createLinkedinProfile({ baseUrl: 'https://www.linkedin.com' })

   beforeEach(() => {
      mocks.readProfile.mockReset().mockResolvedValue({
         outcome: 'DONE',
         counts: [],
         dropped: 0,
      })
   })

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

   it.each([
      [
         {
            capture: false,
            snapshots: false,
         },
         false,
      ],
      [
         {
            capture: true,
            snapshots: false,
         },
         true,
      ],
      [
         {
            capture: false,
            snapshots: true,
         },
         true,
      ],
   ])('should read the profile for the input %j, keeping the pages: %s', async (input, snapshots) => {
      const context = { warn: vi.fn() }

      await task.run(context as never, input as never)

      expect(mocks.readProfile).toHaveBeenCalledWith(context, 'https://www.linkedin.com', { snapshots })
   })
})
