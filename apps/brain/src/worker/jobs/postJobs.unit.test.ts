import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JOBS } from './registry'

const mocks = vi.hoisted(() => ({
   dispatchDue: vi.fn(),
   endStale: vi.fn(),
   deleteFiles: vi.fn(),
}))

vi.mock('database', () => ({
   PostPublicationService: {
      dispatchDue: mocks.dispatchDue,
      endStale: mocks.endStale,
      deleteFiles: mocks.deleteFiles,
   },
}))

vi.mock('env', () => ({
   MINDCASE_API_KEY: '',
   MINDCASE_RPM: 45,
}))

const postSend = JOBS.find(({ name }) => name === 'post-send')
const postSweep = JOBS.find(({ name }) => name === 'post-sweep')
const context = { signal: new AbortController().signal }

describe('post jobs', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should run the post queue every 10 seconds, and report only when a post started, came due or expired', async () => {
      expect(postSend).toMatchObject({
         name: 'post-send',
         everyMs: 10_000,
      })
      expect(postSend?.title.length).toBeGreaterThan(0)
      expect(postSend?.purpose.length).toBeGreaterThan(0)

      mocks.dispatchDue.mockResolvedValueOnce({
         started: 1,
         due: 2,
         expired: 0,
      })
      mocks.dispatchDue.mockResolvedValueOnce({
         started: 0,
         due: 0,
         expired: 0,
      })

      await expect(postSend?.run(context)).resolves.toEqual({
         summary: '2 planned posts came due, 1 post started, 0 could not start in time',
         counts: {
            due: 2,
            started: 1,
            expired: 0,
         },
      })
      await expect(postSend?.run(context)).resolves.toBeUndefined()
   })

   it('should end lost posts as unsure and delete the files of posts that went, reporting only when it did something', async () => {
      expect(postSweep).toMatchObject({ name: 'post-sweep' })

      mocks.endStale.mockResolvedValueOnce(1)
      mocks.deleteFiles.mockResolvedValueOnce(2)
      mocks.endStale.mockResolvedValueOnce(0)
      mocks.deleteFiles.mockResolvedValueOnce(0)

      await expect(postSweep?.run(context)).resolves.toEqual({
         summary: '1 posts ended as unsure, the files of 2 posts deleted',
         counts: {
            ended: 1,
            deleted: 2,
         },
      })
      await expect(postSweep?.run(context)).resolves.toBeUndefined()
   })
})
