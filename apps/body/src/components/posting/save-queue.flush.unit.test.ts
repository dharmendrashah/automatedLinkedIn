import { describe, expect, it, vi } from 'vitest'

import { createSaveQueue } from './save-queue'

describe('createSaveQueue flush', () => {
   it('should say everything was saved once the waiting value is saved, and that something was not when its save failed', async () => {
      const save = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'))
      const queue = createSaveQueue<string>({
         save,
         delay: 500,
         onState: () => undefined,
      })

      await expect(queue.flush()).resolves.toBe(true)

      queue.push('a')

      await expect(queue.flush()).resolves.toBe(true)

      queue.push('b')

      await expect(queue.flush()).resolves.toBe(false)
   })
})
