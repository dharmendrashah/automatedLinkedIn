import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkerConfig } from './config'
import { type ConsumerDefinition } from './consumers/defineConsumer'
import { type JobDefinition } from './jobs/defineJob'
import { type RunRecorder } from './jobs/runRecorder'
import { type RuntimeDependencies, WorkerRuntime } from './runtime'

const consumer = {
   name: 'results',
   queue: 'tasks.done',
   topology: vi.fn().mockResolvedValue(undefined),
   parse: (content: string) => content,
   label: () => 'x',
   handle: vi.fn().mockResolvedValue(undefined),
} as unknown as ConsumerDefinition

const job: JobDefinition = {
   name: 'scoring',
   title: 'Scoring',
   purpose: 'Scores things.',
   everyMs: 1000,
   startAfterMs: 10,
   timeoutMs: 500,
   run: vi.fn().mockResolvedValue(undefined),
}

const fakeChannel = () => ({
   on: vi.fn(),
   assertQueue: vi.fn().mockResolvedValue(undefined),
   prefetch: vi.fn().mockResolvedValue(undefined),
   consume: vi.fn().mockResolvedValue({ consumerTag: 'tag' }),
   cancel: vi.fn().mockResolvedValue(undefined),
   checkQueue: vi.fn().mockResolvedValue({ messageCount: 0 }),
   close: vi.fn().mockResolvedValue(undefined),
})

const setup = (
   roles: string,
   databaseHealthy: () => Promise<boolean> = async () => true,
   extra: Partial<RuntimeDependencies> = {}
) => {
   const channel = fakeChannel()
   const log = {
      info: vi.fn(),
      error: vi.fn(),
   }
   const runtime = new WorkerRuntime(
      createWorkerConfig({
         roles,
         healthPort: 0,
         shutdownGraceMs: 100,
      }),
      {
         consumers: [consumer],
         jobs: [job],
         openChannel: vi.fn().mockResolvedValue(channel),
         isDatabaseHealthy: databaseHealthy,
         isBrokerHealthy: async () => true,
         taskDispatch: async () => ({
            waiting: 0,
            oldestSeconds: 0,
         }),
         build: {
            commit: 'abc1234',
            builtAt: 'now',
         },
         log,
         databasePollMs: 10,
         ...extra,
      }
   )

   return {
      runtime,
      channel,
      log,
   }
}

describe('WorkerRuntime', () => {
   beforeEach(() => {
      vi.mocked(job.run).mockClear()
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should consume and run jobs when it has both roles', async () => {
      const { runtime, channel } = setup('consumers,jobs')

      await runtime.start()

      expect(channel.consume).toHaveBeenCalledWith('tasks.done', expect.any(Function), { noAck: false })

      await expect.poll(() => vi.mocked(job.run).mock.calls.length).toBe(1)
      await runtime.stop()
   })

   it('should only consume with the consumers role', async () => {
      const { runtime, channel } = setup('consumers')

      await runtime.start()
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(channel.consume).toHaveBeenCalled()
      expect(job.run).not.toHaveBeenCalled()
      await runtime.stop()
   })

   it('should only run jobs with the jobs role, and open no channel', async () => {
      const { runtime, channel } = setup('jobs')

      await runtime.start()

      expect(channel.consume).not.toHaveBeenCalled()
      await expect.poll(() => vi.mocked(job.run).mock.calls.length).toBe(1)
      await runtime.stop()
   })

   it('should wait for the database before it starts anything, and say so once', async () => {
      const healthy = vi
         .fn<() => Promise<boolean>>()
         .mockResolvedValueOnce(false)
         .mockResolvedValueOnce(false)
         .mockResolvedValue(true)
      const { runtime, channel, log } = setup('consumers', healthy)
      const started = runtime.start()

      await new Promise(resolve => setTimeout(resolve, 5))

      expect(channel.consume).not.toHaveBeenCalled()

      await started

      expect(channel.consume).toHaveBeenCalled()
      expect(log.error.mock.calls.filter(([text]) => String(text).includes('database'))).toHaveLength(1)
      await runtime.stop()
   })

   it('should stop waiting for the database when it is stopped', async () => {
      const { runtime, channel } = setup('consumers', async () => false)
      const started = runtime.start()

      await new Promise(resolve => setTimeout(resolve, 5))
      await runtime.stop()
      await started

      expect(channel.consume).not.toHaveBeenCalled()
   })

   it('should answer /health, not ready until its consumers are connected', async () => {
      const { runtime } = setup('consumers')

      await runtime.start()

      const response = await fetch(`http://127.0.0.1:${runtime.healthPort()}/health`)
      const body = (await response.json()) as { service: string; consumers: Array<{ connected: boolean }> }

      expect(response.status).toBe(200)
      expect(body.service).toBe('brain-worker')
      expect(body.consumers[0].connected).toBe(true)
      await runtime.stop()
   })

   it('should cancel the consumers and close the channel on stop', async () => {
      const { runtime, channel } = setup('consumers')

      await runtime.start()
      await runtime.stop()

      expect(channel.cancel).toHaveBeenCalledWith('tag')
      expect(channel.close).toHaveBeenCalled()
   })

   it('should announce its jobs to the monitor and run the recorder from the start to the stop', async () => {
      const recorder = {
         add: vi.fn(),
         start: vi.fn(),
         stop: vi.fn().mockResolvedValue(undefined),
      }
      const announceJobs = vi.fn().mockResolvedValue(undefined)
      const { runtime } = setup('jobs', undefined, {
         recorder: recorder as unknown as RunRecorder,
         announceJobs,
      })

      await runtime.start()

      expect(announceJobs).toHaveBeenCalledWith([job])
      expect(recorder.start).toHaveBeenCalled()

      await runtime.stop()

      expect(recorder.stop).toHaveBeenCalled()
   })

   it('should still run its jobs when the announcement fails, and say so', async () => {
      const announceJobs = vi.fn().mockRejectedValue(new Error('no table'))
      const { runtime, log } = setup('jobs', undefined, { announceJobs })

      await runtime.start()

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('could not announce its jobs: no table'))
      await expect.poll(() => vi.mocked(job.run).mock.calls.length).toBe(1)
      await runtime.stop()
   })

   it('should not announce anything without the jobs role', async () => {
      const announceJobs = vi.fn()
      const { runtime } = setup('consumers', undefined, { announceJobs })

      await runtime.start()

      expect(announceJobs).not.toHaveBeenCalled()
      await runtime.stop()
   })
})
