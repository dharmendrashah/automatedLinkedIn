import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type SaveState, createSaveQueue } from './save-queue'

const deferred = () => {
   let finish: () => void = () => undefined
   let fail: (error: Error) => void = () => undefined
   const promise = new Promise<void>((resolve, reject) => {
      finish = resolve
      fail = reject
   })

   return {
      promise,
      finish,
      fail,
   }
}

describe('createSaveQueue', () => {
   beforeEach(() => {
      vi.useFakeTimers()
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   const setup = (save: (value: string) => Promise<void>) => {
      const states: SaveState[] = []
      const queue = createSaveQueue<string>({
         save,
         delay: 500,
         onState: state => states.push(state),
      })

      return {
         queue,
         states,
      }
   }

   it('should save once, the latest value, after the edits stop', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      const { queue, states } = setup(save)

      queue.push('a')
      queue.push('ab')
      await vi.advanceTimersByTimeAsync(499)

      expect(save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(save).toHaveBeenCalledTimes(1)
      expect(save).toHaveBeenCalledWith('ab')
      expect(states.at(-1)).toBe('saved')
   })

   it('should never run two saves at once, and send only the newest of what came while one was running', async () => {
      const first = deferred()
      const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
      const { queue, states } = setup(save)

      queue.push('a')
      await vi.advanceTimersByTimeAsync(500)
      queue.push('b')
      queue.push('c')
      await vi.advanceTimersByTimeAsync(500)

      expect(save).toHaveBeenCalledTimes(1)

      first.finish()
      await vi.advanceTimersByTimeAsync(0)

      expect(save.mock.calls).toEqual([['a'], ['c']])
      expect(states.at(-1)).toBe('saved')
   })

   it('should report a failed save and send the same value again on retry', async () => {
      const failing = deferred()
      const save = vi.fn().mockReturnValueOnce(failing.promise).mockResolvedValue(undefined)
      const { queue, states } = setup(save)

      queue.push('a')
      await vi.advanceTimersByTimeAsync(500)
      failing.fail(new Error('offline'))
      await vi.advanceTimersByTimeAsync(0)

      expect(states.at(-1)).toBe('error')

      await queue.retry()

      expect(save.mock.calls).toEqual([['a'], ['a']])
      expect(states.at(-1)).toBe('saved')
   })

   it('should save at once on flush, and do nothing when nothing is waiting', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      const { queue } = setup(save)

      await queue.flush()

      expect(save).not.toHaveBeenCalled()

      queue.push('a')
      await queue.flush()

      expect(save).toHaveBeenCalledWith('a')
   })
})
