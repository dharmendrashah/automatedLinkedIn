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

const RUN = 'POST /v1/data/linkedin/post-comments/run'

describe('DataClient', () => {
   it('should start a job without waiting and return its id', async () => {
      const { client } = fakeService({ [RUN]: [{ body: { job_id: 'job-1' } }] })

      await expect(client.start('post-comments', { posts: 'x' })).resolves.toBe('job-1')
   })

   it('should report a running job as null, and a finished one with its rows and real charge', async () => {
      const { client, calls } = fakeService({
         'GET /v1/jobs/job-2/results': [
            { body: { status: 'running' } },
            {
               body: {
                  status: 'completed',
                  data: [{ commenterName: 'Ada' }, 'not a row'],
               },
            },
         ],
         'GET /v1/jobs/job-2': [{ body: { usd_used: 0.002 } }],
      })

      await expect(client.check('job-2')).resolves.toBeNull()
      await expect(client.check('job-2')).resolves.toEqual({
         jobId: 'job-2',
         status: 'completed',
         rows: [{ commenterName: 'Ada' }],
         costMicros: 2_000,
         error: null,
      })
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
      await expect(client.start('post-comments', { nope: 1 })).rejects.toMatchObject({ kind: 'BAD_REQUEST' })
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

      await expect(client.start('post-comments', {})).rejects.toMatchObject({ kind: 'UNAVAILABLE' })
      expect(calls).toEqual([RUN])
      await expect(
         new DataClient({
            key: '',
            requestsPerMinute: 45,
         }).balanceMicros()
      ).rejects.toBeInstanceOf(DataServiceError)
   })
})
