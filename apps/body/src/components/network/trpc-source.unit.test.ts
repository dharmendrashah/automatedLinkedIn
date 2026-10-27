import { TRPCClientError } from '@trpc/client'
import { describe, expect, it, vi } from 'vitest'

import { NetworkRefusal } from './source'
import { type NetworkClient, createTrpcSource } from './trpc-source'

const failure = (code: string, message: string, budgetRefusal = false) =>
   TRPCClientError.from({
      error: {
         message,
         code: -32603,
         data: {
            code,
            httpStatus: 412,
            budgetRefusal,
         },
      },
   } as never)

const setup = () => {
   const client = {
      network: {
         list: { query: vi.fn(async () => ({ requests: [] })) },
         waiting: { query: vi.fn(async () => ({ a1: 2 })) },
         refresh: { mutate: vi.fn(async () => ({ started: true })) },
         answer: { mutate: vi.fn(async () => ({ started: 1 })) },
      },
   }

   return {
      client,
      source: createTrpcSource(client as unknown as NetworkClient),
   }
}

describe('createTrpcSource', () => {
   it('should ask brain for the requests, the counts, a read and the answers, in the order given', async () => {
      const { client, source } = setup()
      const asks = [
         {
            id: 'r2',
            action: 'IGNORE' as const,
         },
         {
            id: 'r1',
            action: 'ACCEPT' as const,
         },
      ]

      await source.load('a1')
      await source.waiting(['a1'])
      await source.refresh('a1', { startAnyway: false })
      await source.answer('a1', asks, { startAnyway: true })

      expect(client.network.list.query).toHaveBeenCalledWith({ accountId: 'a1' })
      expect(client.network.waiting.query).toHaveBeenCalledWith({ accountIds: ['a1'] })
      expect(client.network.refresh.mutate).toHaveBeenCalledWith({ accountId: 'a1', startAnyway: false })
      expect(client.network.answer.mutate).toHaveBeenCalledWith({ accountId: 'a1', answers: asks, startAnyway: true })
   })

   it('should tell a refusal as a sentence, and mark the one the owner may go past with Start anyway', async () => {
      const { client, source } = setup()

      client.network.refresh.mutate.mockRejectedValueOnce(
         failure('PRECONDITION_FAILED', 'Outside working hours.', true)
      )
      client.network.answer.mutate.mockRejectedValueOnce(failure('PRECONDITION_FAILED', 'This account is busy.'))

      await expect(source.refresh('a1', { startAnyway: false })).rejects.toMatchObject({
         message: 'Outside working hours.',
         budget: true,
      })
      await expect(
         source.answer('a1', [{ id: 'r1', action: 'ACCEPT' }], { startAnyway: false })
      ).rejects.toBeInstanceOf(NetworkRefusal)
   })

   it('should leave any other failure as it is', async () => {
      const { client, source } = setup()
      const broken = failure('INTERNAL_SERVER_ERROR', 'Something went wrong.')

      client.network.refresh.mutate.mockRejectedValueOnce(broken)

      await expect(source.refresh('a1', { startAnyway: false })).rejects.toBe(broken)
   })
})
