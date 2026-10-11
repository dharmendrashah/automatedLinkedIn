import { describe, expect, it, vi } from 'vitest'

import { type ScrapeTaskCommand, type ScrapeTaskResult } from '../types'

import { AccountBusyError, TaskError } from './errors'
import { processTask } from './processTask'

const command = {
   task_id: 'task-1',
   task_type: 'demo.posts',
   timestamp: '2026-10-11T10:00:00.000Z',
   auth_session_key: '',
   target_url: 'http://localhost:8080/',
   actions: [],
} as ScrapeTaskCommand

const accountCommand = {
   ...command,
   account_id: 'acc1',
} as ScrapeTaskCommand

const cookie = {
   name: 'li_at',
   value: 'TOPSECRETCOOKIE',
   domain: '.example.com',
   path: '/',
}

const setup = () => {
   let time = 1_000_000
   const events: string[] = []

   const engine = {
      run: vi.fn(async () => {
         time += 1500

         return {
            records: [
               {
                  author: 'Ada',
                  text: 'Hi',
               },
            ],
            cookies: [cookie],
         }
      }),
   }
   const store = {
      put: vi.fn(async (key: string) => {
         events.push(key.startsWith('sessions/') ? 'session' : 'stored')
      }),
   }
   const release = vi.fn(async () => {
      events.push('released')
   })
   const accountLock = {
      acquire: vi.fn(async () => {
         events.push('acquired')

         return { release }
      }),
   }
   const publishResult = vi.fn(async (_result: ScrapeTaskResult) => {
      events.push('published')
   })

   return {
      engine,
      store,
      accountLock,
      release,
      publishResult,
      events,
      deps: {
         engine,
         store,
         accountLock,
         publishResult,
         now: () => time,
      },
   }
}

describe('processTask', () => {
   it('should store the raw result, then publish SUCCESS with the storage path', async () => {
      const { deps, store, publishResult, events } = setup()

      await processTask(command, deps)

      expect(store.put).toHaveBeenCalledWith('results/demo.posts/task-1.json', expect.any(String), 'application/json')

      const [, body] = store.put.mock.calls[0] as unknown as [string, string]

      expect(JSON.parse(body)).toMatchObject({
         task_id: 'task-1',
         task_type: 'demo.posts',
         record_count: 1,
         records: [
            {
               author: 'Ada',
               text: 'Hi',
            },
         ],
      })
      expect(publishResult).toHaveBeenCalledWith({
         task_id: 'task-1',
         task_type: 'demo.posts',
         status: 'SUCCESS',
         timestamp: expect.any(String),
         execution_time_seconds: 1.5,
         result_storage_path: 'results/demo.posts/task-1.json',
         error: null,
      })
      expect(events).toEqual(['stored', 'published'])
   })

   it('should report FAILED, with the reason and no storage path, when the task itself cannot succeed', async () => {
      const { deps, engine, store, publishResult } = setup()

      engine.run.mockRejectedValue(new TaskError('robots.txt for example.com does not allow /x'))

      await expect(processTask(command, deps)).resolves.toBeUndefined()

      expect(store.put).not.toHaveBeenCalled()
      expect(publishResult).toHaveBeenCalledWith(
         expect.objectContaining({
            status: 'FAILED',
            result_storage_path: null,
            error: 'robots.txt for example.com does not allow /x',
         })
      )
   })

   it('should rethrow an infrastructure error from the engine without reporting a result, so it is retried', async () => {
      const { deps, engine, publishResult } = setup()

      engine.run.mockRejectedValue(new Error('storage unavailable'))

      await expect(processTask(command, deps)).rejects.toThrow('storage unavailable')
      expect(publishResult).not.toHaveBeenCalled()
   })

   it('should rethrow when the result cannot be stored, without announcing success', async () => {
      const { deps, store, publishResult } = setup()

      store.put.mockRejectedValue(new Error('bucket not found'))

      await expect(processTask(command, deps)).rejects.toThrow('bucket not found')
      expect(publishResult).not.toHaveBeenCalled()
   })

   it('should rethrow when the result cannot be published, so the task is delivered again', async () => {
      const { deps, publishResult } = setup()

      publishResult.mockRejectedValue(new Error('broker down'))

      await expect(processTask(command, deps)).rejects.toThrow('broker down')
   })

   describe('without an account', () => {
      it('should take no lease and keep no session, even if the browser holds cookies', async () => {
         const { deps, accountLock, store, publishResult } = setup()

         await processTask(command, deps)

         expect(accountLock.acquire).not.toHaveBeenCalled()
         expect(store.put).toHaveBeenCalledTimes(1)
         expect(publishResult.mock.calls[0][0]).not.toHaveProperty('session_storage_path')
      })
   })

   describe('with an account', () => {
      it('should hold the lease of the account for the whole task and release it last', async () => {
         const { deps, accountLock, events } = setup()

         await processTask(accountCommand, deps)

         expect(accountLock.acquire).toHaveBeenCalledWith('acc1', 'task-1')
         expect(events).toEqual(['acquired', 'stored', 'session', 'published', 'released'])
      })

      it('should save the refreshed session under the account, then report where', async () => {
         const { deps, store, publishResult } = setup()

         await processTask(accountCommand, deps)

         expect(store.put).toHaveBeenCalledWith('sessions/acc1/state.json', expect.any(String), 'application/json')

         const [, body] = store.put.mock.calls[1] as unknown as [string, string]

         expect(JSON.parse(body)).toEqual({ cookies: [cookie] })
         expect(publishResult).toHaveBeenCalledWith(
            expect.objectContaining({
               status: 'SUCCESS',
               session_storage_path: 'sessions/acc1/state.json',
            })
         )
      })

      it('should never put a cookie value in the result message', async () => {
         const { deps, publishResult } = setup()

         await processTask(accountCommand, deps)

         expect(JSON.stringify(publishResult.mock.calls)).not.toContain('TOPSECRETCOOKIE')
      })

      it('should keep the stored session, and report none, when no allowed cookie is left', async () => {
         const { deps, engine, store, publishResult } = setup()

         engine.run.mockResolvedValue({
            records: [],
            cookies: [],
         })

         await processTask(accountCommand, deps)

         expect(store.put).toHaveBeenCalledTimes(1)
         expect(publishResult.mock.calls[0][0]).not.toHaveProperty('session_storage_path')
         expect(publishResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }))
      })

      it('should not touch the stored session when the task fails, and still release the lease', async () => {
         const { deps, engine, store, release } = setup()

         engine.run.mockRejectedValue(new TaskError('A checkpoint was shown'))

         await processTask(accountCommand, deps)

         expect(store.put).not.toHaveBeenCalled()
         expect(release).toHaveBeenCalledTimes(1)
      })

      it('should release the lease when an infrastructure error makes the task retry', async () => {
         const { deps, engine, release } = setup()

         engine.run.mockRejectedValue(new Error('storage unavailable'))

         await expect(processTask(accountCommand, deps)).rejects.toThrow('storage unavailable')
         expect(release).toHaveBeenCalledTimes(1)
      })

      it('should not announce success when the session cannot be saved, and release the lease', async () => {
         const { deps, store, publishResult, release } = setup()

         store.put.mockImplementation(async (key: string) => {
            if (key.startsWith('sessions/')) {
               throw new Error('bucket unavailable')
            }
         })

         await expect(processTask(accountCommand, deps)).rejects.toThrow('bucket unavailable')
         expect(publishResult).not.toHaveBeenCalled()
         expect(release).toHaveBeenCalledTimes(1)
      })

      it('should not run the task when another task holds the account, and report nothing', async () => {
         const { deps, accountLock, engine, store, publishResult, release } = setup()

         accountLock.acquire.mockResolvedValue(undefined as never)

         await expect(processTask(accountCommand, deps)).rejects.toBeInstanceOf(AccountBusyError)
         expect(engine.run).not.toHaveBeenCalled()
         expect(store.put).not.toHaveBeenCalled()
         expect(publishResult).not.toHaveBeenCalled()
         expect(release).not.toHaveBeenCalled()
      })

      it('should not run the task when the lease cannot be taken, so the task is retried', async () => {
         const { deps, accountLock, engine } = setup()

         accountLock.acquire.mockRejectedValue(new Error('bucket unavailable'))

         await expect(processTask(accountCommand, deps)).rejects.toThrow('bucket unavailable')
         expect(engine.run).not.toHaveBeenCalled()
      })

      it('should not let a lease that cannot be released hide the outcome', async () => {
         const { deps, release, publishResult } = setup()

         release.mockRejectedValue(new Error('bucket unavailable'))

         await expect(processTask(accountCommand, deps)).resolves.toBeUndefined()
         expect(publishResult).toHaveBeenCalledTimes(1)
      })
   })
})
