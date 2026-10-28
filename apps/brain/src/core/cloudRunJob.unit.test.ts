import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudRunJob } from './cloudRunJob'

const mocks = vi.hoisted(() => ({
   env: { CLOUD_RUN_JOB: 'projects/p/locations/asia-south1/jobs/spider-worker' },
   readyCount: vi.fn(),
   runJob: vi.fn(),
   listExecutions: vi.fn(),
   getJob: vi.fn(),
}))

vi.mock('env', () => mocks.env)

vi.mock('./messageBroker', () => ({ MessageBroker: { readyCount: mocks.readyCount } }))

vi.mock('@google-cloud/run', () => ({
   JobsClient: class {
      public runJob = mocks.runJob

      public getJob = mocks.getJob
   },
   ExecutionsClient: class {
      public listExecutions = mocks.listExecutions
   },
}))

const JOB = 'projects/p/locations/asia-south1/jobs/spider-worker'

// Only completionTime matters: no completion time means the execution is still running (or starting).
const execution = (completed: boolean) => ({
   name: 'execution',
   completionTime: completed ? { seconds: 1 } : null,
})

describe('CloudRunJob.start', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.env.CLOUD_RUN_JOB = JOB
      mocks.listExecutions.mockResolvedValue([[]])
      mocks.runJob.mockResolvedValue([{}])
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
   })

   it('should do nothing and call no API when no job is configured', async () => {
      mocks.env.CLOUD_RUN_JOB = ''

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 0 })

      expect(mocks.readyCount).not.toHaveBeenCalled()
      expect(mocks.runJob).not.toHaveBeenCalled()
   })

   it('should start one execution for each waiting task that no running execution will take', async () => {
      mocks.readyCount.mockResolvedValue(3)
      mocks.listExecutions.mockResolvedValue([[execution(false)]])

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 2 })

      expect(mocks.readyCount).toHaveBeenCalledWith('tasks.run')
      expect(mocks.listExecutions).toHaveBeenCalledWith(
         {
            parent: JOB,
            pageSize: 100,
         },
         { autoPaginate: false }
      )
      expect(mocks.runJob).toHaveBeenCalledTimes(2)
      expect(mocks.runJob).toHaveBeenCalledWith({ name: JOB })
   })

   it('should count only executions that have no completion time as running', async () => {
      mocks.readyCount.mockResolvedValue(2)
      mocks.listExecutions.mockResolvedValue([[execution(true), execution(false)]])

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 1 })
   })

   it('should start nothing, and read no executions, when the queue is empty', async () => {
      mocks.readyCount.mockResolvedValue(0)

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 0 })

      expect(mocks.listExecutions).not.toHaveBeenCalled()
      expect(mocks.runJob).not.toHaveBeenCalled()
   })

   it('should start nothing when the running executions already cover the waiting tasks', async () => {
      mocks.readyCount.mockResolvedValue(2)
      mocks.listExecutions.mockResolvedValue([[execution(false), execution(false)]])

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 0 })

      expect(mocks.runJob).not.toHaveBeenCalled()
   })

   it('should count a start that an earlier call made, when two calls overlap', async () => {
      const started: unknown[] = []

      mocks.readyCount.mockResolvedValue(1)
      mocks.listExecutions.mockImplementation(async () => [started.map(() => execution(false))])
      mocks.runJob.mockImplementation(async () => {
         started.push({})

         return [{}]
      })

      const results = await Promise.all([CloudRunJob.start(), CloudRunJob.start()])

      expect(results).toEqual([{ started: 1 }, { started: 0 }])
      expect(mocks.runJob).toHaveBeenCalledTimes(1)
   })

   it('should never throw: a failed start is logged with the error name only, and the next call tries again', async () => {
      const denied = Object.assign(new Error('projects/p/secret-detail'), { name: 'PermissionDeniedError' })

      mocks.readyCount.mockResolvedValue(1)
      mocks.runJob.mockRejectedValueOnce(denied).mockResolvedValueOnce([{}])

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 0 })
      expect(console.error).toHaveBeenCalledWith('Could not start a spider job: PermissionDeniedError')
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-detail')

      await expect(CloudRunJob.start()).resolves.toEqual({ started: 1 })
   })
})

describe('CloudRunJob.reading', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.env.CLOUD_RUN_JOB = JOB
   })

   it('should read a ready job that has not run yet as ready, with no failed run', async () => {
      mocks.getJob.mockResolvedValue([{ terminalCondition: { state: 'CONDITION_SUCCEEDED' } }])

      await expect(CloudRunJob.reading()).resolves.toEqual({
         found: true,
         ready: true,
         lastRunFailedAt: null,
      })
      expect(mocks.getJob).toHaveBeenCalledWith({ name: JOB })
   })

   it('should read a job that is not ready, and when its latest run failed', async () => {
      mocks.getJob.mockResolvedValue([
         {
            terminalCondition: { state: 'CONDITION_RECONCILING' },
            latestCreatedExecution: {
               completionStatus: 'EXECUTION_FAILED',
               completionTime: {
                  seconds: 1790000000,
                  nanos: 500000000,
               },
            },
         },
      ])

      await expect(CloudRunJob.reading()).resolves.toEqual({
         found: true,
         ready: false,
         lastRunFailedAt: new Date(1790000000 * 1000 + 500),
      })
   })

   it('should say when the job does not exist', async () => {
      mocks.getJob.mockRejectedValue(Object.assign(new Error('not found'), { code: 5 }))

      await expect(CloudRunJob.reading()).resolves.toEqual({ found: false })
   })

   it('should let any other error through, so the status page can say it could not ask', async () => {
      mocks.getJob.mockRejectedValue(Object.assign(new Error('denied'), { code: 7 }))

      await expect(CloudRunJob.reading()).rejects.toThrow('denied')
   })
})
