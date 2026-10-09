import { afterEach, describe, expect, it, vi } from 'vitest'

import { PrismaService } from './prisma.service'

const { queryRaw, disconnect } = vi.hoisted(() => ({
   queryRaw: vi.fn(),
   disconnect: vi.fn(),
}))

vi.mock('env', () => ({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' }))

vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn() }))

vi.mock('generated/prisma/client', () => ({
   PrismaClient: vi.fn(function PrismaClient() {
      return {
         $queryRaw: queryRaw,
         $disconnect: disconnect,
      }
   }),
}))

describe('PrismaService', () => {
   afterEach(async () => {
      await PrismaService.disconnect()

      vi.clearAllMocks()
   })

   describe('.client', () => {
      it('should reuse a single client instance', () => {
         expect(PrismaService.client).toBe(PrismaService.client)
      })
   })

   describe('.disconnect', () => {
      it('should disconnect the client and create a new one afterwards', async () => {
         const first = PrismaService.client

         await PrismaService.disconnect()

         expect(disconnect).toHaveBeenCalledOnce()

         expect(PrismaService.client).not.toBe(first)
      })

      it('should not fail when no client was created', async () => {
         await expect(PrismaService.disconnect()).resolves.toBeUndefined()

         expect(disconnect).not.toHaveBeenCalled()
      })
   })

   describe('.isHealthy', () => {
      it('should return true when the database answers', async () => {
         queryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

         await expect(PrismaService.isHealthy()).resolves.toBe(true)
      })

      it('should return false when the query fails', async () => {
         queryRaw.mockRejectedValueOnce(new Error('connection refused'))

         await expect(PrismaService.isHealthy()).resolves.toBe(false)
      })
   })
})
