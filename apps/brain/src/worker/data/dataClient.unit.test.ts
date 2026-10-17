import { describe, expect, it, vi } from 'vitest'

import { DataClient, DataServiceError } from './dataClient'

type Reply = { status?: number; body: unknown }

const fakeService = (replies: Record<string, Reply[]>) => {
   const calls: string[] = []
   const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('https://api.mindcase.co', '')}`
      const reply = replies[key]?.shift()

      calls.push(key)

      if (!reply) {
         throw new Error(`unexpected ${key}`)
      }

      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 })
   })

   return {
      calls,
      client: new DataClient({
         key: 'test-key',
         requestsPerMinute: 60_000,
         fetch: fetcher,
         sleep: async () => undefined,
      }),
   }
}

const RUN = 'POST /v1/data/linkedin/post-comments/run?wait=true&wait_timeout=55'

describe('DataClient', () => {
   it('should save the job id at once, return the rows and read the real charge', async () => {
      const { client } = fakeService({
         [RUN]: [
            {
               body: {
                  job_id: 'job-1',
                  status: 'completed',
                  truncated: false,
                  data: [{ commenterName: 'Ada' }],
               },
            },
         ],
         'GET /v1/jobs/job-1': [{ body: { usd_used: 0.002 } }],
      })
      const onJobId = vi.fn(async () => undefined)

      await expect(
         client.collect(
            'post-comments',
            { posts: 'x' },
            {
               jobId: null,
               onJobId,
            }
         )
      ).resolves.toEqual({
         jobId: 'job-1',
         status: 'completed',
         rows: [{ commenterName: 'Ada' }],
         costMicros: 2_000,
         error: null,
      })
      expect(onJobId).toHaveBeenCalledWith('job-1')
   })

   it('should resume a known job by polling, never starting a new one', async () => {
      const { client, calls } = fakeService({
         'GET /v1/jobs/job-2/results': [
            { body: { status: 'running' } },
            {
               body: {
                  status: 'completed',
                  data: [{}, {}],
               },
            },
         ],
         'GET /v1/jobs/job-2': [{ body: { usd_used: 0.004 } }],
      })

      const outcome = await client.collect(
         'post-comments',
         {},
         {
            jobId: 'job-2',
            onJobId: async () => undefined,
         }
      )

      expect(outcome.rows).toHaveLength(2)
      expect(calls.some(call => call.startsWith('POST'))).toBe(false)
   })

   it('should classify a refused key, an empty wallet and a bad parameter', async () => {
      const { client } = fakeService({
         'GET /v1/balance': [
            {
               status: 401,
               body: {},
            },
            {
               status: 402,
               body: {},
            },
         ],
         [RUN]: [
            {
               status: 422,
               body: { detail: 'Unknown parameters: nope' },
            },
         ],
      })

      await expect(client.balanceMicros()).rejects.toMatchObject({ kind: 'CONFIG' })
      await expect(client.balanceMicros()).rejects.toMatchObject({ kind: 'BALANCE' })
      await expect(
         client.collect(
            'post-comments',
            { nope: 1 },
            {
               jobId: null,
               onJobId: async () => undefined,
            }
         )
      ).rejects.toBeInstanceOf(DataServiceError)
   })

   it('should not send a start again after a server error, and refuse to work without a key', async () => {
      const { client, calls } = fakeService({
         [RUN]: [
            {
               status: 502,
               body: {},
            },
         ],
      })

      await expect(
         client.collect(
            'post-comments',
            {},
            {
               jobId: null,
               onJobId: async () => undefined,
            }
         )
      ).rejects.toMatchObject({ kind: 'UNAVAILABLE' })
      expect(calls).toEqual([RUN])
      await expect(
         new DataClient({
            key: '',
            requestsPerMinute: 45,
         }).balanceMicros()
      ).rejects.toMatchObject({ kind: 'CONFIG' })
   })
})
