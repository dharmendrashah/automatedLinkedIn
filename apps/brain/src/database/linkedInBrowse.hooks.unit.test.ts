import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInBrowseHooks } from './linkedInBrowse.hooks'
import { TaskRefusedError } from './taskErrors'

const mocks = vi.hoisted(() => ({ dailyTime: vi.fn() }))

vi.mock('core', () => ({
   dailyTime: mocks.dailyTime,
   timezoneOfCountry: (code: string | null) => (code === 'IN' ? 'Asia/Kolkata' : 'UTC'),
}))

const updateMany = vi.fn()
const findUnique = vi.fn()
const findProxy = vi.fn()
const update = vi.fn()
const tx = {
   linkedInAccount: {
      updateMany,
      findUnique,
      update,
   },
   proxyServer: { findUnique: findProxy },
} as unknown as Prisma.TransactionClient
const request = (trigger: 'manual' | 'automatic') => ({
   id: 's1',
   userId: 'u1',
   accountId: 'acc1',
   proxyId: 'p1',
   task: 'linkedin-browse',
   trigger,
})
const TOMORROW = new Date('2026-10-20T08:00:00Z')
const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const result = (verdict: string) => ({ verdict }) as TaskResult

describe('linkedin-browse hooks', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z') })
      updateMany.mockReset().mockResolvedValue({ count: 1 })
      findUnique.mockReset().mockResolvedValue({ status: 'ACTIVE' })
      findProxy.mockReset().mockResolvedValue({ detectedCountryCode: 'IN' })
      update.mockReset().mockResolvedValue({})
      mocks.dailyTime.mockReset().mockReturnValue(TOMORROW)
   })

   describe('onRequest', () => {
      it('should refuse an account that is not signed in, by hand or not', async () => {
         findUnique.mockResolvedValue({ status: 'ERROR' })

         await expect(linkedInBrowseHooks.onRequest?.(request('manual'), tx)).rejects.toBeInstanceOf(TaskRefusedError)
         expect(update).not.toHaveBeenCalled()
      })

      it('should count a visit asked for by hand as the visit of the day, drawn in the day of the proxy country', async () => {
         await linkedInBrowseHooks.onRequest?.(request('manual'), tx)

         expect(mocks.dailyTime).toHaveBeenCalledWith(new Date('2026-10-19T10:00:00Z'), 'Asia/Kolkata', {
            today: false,
         })
         expect(update).toHaveBeenCalledWith({
            where: { id: 'acc1' },
            data: { nextBrowseAt: TOMORROW },
         })
      })

      it('should leave the time of an automatic visit to the daily job', async () => {
         await linkedInBrowseHooks.onRequest?.(request('automatic'), tx)

         expect(update).not.toHaveBeenCalled()
      })
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should bring the sign-in check of an active account forward when the visit found it signed out', async () => {
      await linkedInBrowseHooks.onResult?.(session, result('SIGNED_OUT'), tx)

      expect(updateMany).toHaveBeenCalledWith({
         where: {
            id: 'acc1',
            status: 'ACTIVE',
         },
         data: { nextCheckAt: new Date('2026-10-19T10:00:00Z') },
      })
   })

   it('should change nothing on the account after any other answer', async () => {
      await linkedInBrowseHooks.onResult?.(session, result('DONE'), tx)
      await linkedInBrowseHooks.onResult?.(session, result('CRASHED'), tx)

      expect(updateMany).not.toHaveBeenCalled()
   })
})
