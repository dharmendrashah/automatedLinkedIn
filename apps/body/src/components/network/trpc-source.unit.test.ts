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
         list: { query: vi.fn(async () => ({ requests: [], accounts: [], cut: false })) },
         waiting: { query: vi.fn(async () => ({ a1: 2 })) },
         refresh: { mutate: vi.fn(async () => ({ started: ['a1', 'a2'], skipped: [] })) },
         answer: { mutate: vi.fn(async () => ({ started: 1 })) },
      },
   }

   return {
      client,
      source: createTrpcSource(client as unknown as NetworkClient),
   }
}

describe('createTrpcSource', () => {
   it('should ask brain for the requests and the counts of many accounts, a read of them, and the answers of one', async () => {
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

      await source.load(['a1', 'a2'])
      await source.waiting(['a1'])
      await expect(source.refresh(['a1', 'a2'], { startAnyway: false })).resolves.toEqual({
         started: ['a1', 'a2'],
         skipped: [],
      })
      await source.answer('a1', asks, { startAnyway: true })

      expect(client.network.list.query).toHaveBeenCalledWith({ accountIds: ['a1', 'a2'] })
      expect(client.network.waiting.query).toHaveBeenCalledWith({ accountIds: ['a1'] })
      expect(client.network.refresh.mutate).toHaveBeenCalledWith({ accountIds: ['a1', 'a2'], startAnyway: false })
      expect(client.network.answer.mutate).toHaveBeenCalledWith({ accountId: 'a1', answers: asks, startAnyway: true })
   })

   it('should tell a refusal to answer as a sentence, and mark the one the owner may go past with Start anyway', async () => {
      const { client, source } = setup()

      client.network.answer.mutate.mockRejectedValueOnce(failure('PRECONDITION_FAILED', 'Outside working hours.', true))
      client.network.answer.mutate.mockRejectedValueOnce(failure('PRECONDITION_FAILED', 'This account is busy.'))

      await expect(source.answer('a1', [{ id: 'r1', action: 'ACCEPT' }], { startAnyway: false })).rejects.toMatchObject(
         {
            message: 'Outside working hours.',
            budget: true,
         }
      )
      await expect(
         source.answer('a1', [{ id: 'r1', action: 'ACCEPT' }], { startAnyway: false })
      ).rejects.toBeInstanceOf(NetworkRefusal)
   })

   it('should leave any other failure as it is', async () => {
      const { client, source } = setup()
      const broken = failure('INTERNAL_SERVER_ERROR', 'Something went wrong.')

      client.network.answer.mutate.mockRejectedValueOnce(broken)

      await expect(source.answer('a1', [{ id: 'r1', action: 'ACCEPT' }], { startAnyway: false })).rejects.toBe(broken)
   })
})
