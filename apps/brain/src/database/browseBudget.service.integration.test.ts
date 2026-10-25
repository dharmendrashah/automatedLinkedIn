import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type TaskBudget } from '@automatedLinkedIn/contracts'

import { BrowseBudgetService } from './browseBudget.service'
import { PrismaService } from './prisma.service'
import { BrowseBudgetError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL. The check is on for this file; it is off by default in development and tests.
vi.mock('env', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('env')),
   BROWSE_BUDGET: true,
}))

const email = `${randomUUID()}@elitale.com`
const WEDNESDAY_NOON = new Date('2026-10-21T12:00:00Z')
const SATURDAY_NOON = new Date('2026-10-24T12:00:00Z')
const at = (minutes: number) => new Date(WEDNESDAY_NOON.getTime() + minutes * 60_000)
const ACTION: TaskBudget = {
   estimate_s: 300,
   class: 'ACTION',
}

let userId: string
let accountId: string

const result = (patch: Record<string, unknown> = {}) => ({
   verdict: 'DONE',
   worker: { build: 'abc1234' },
   started_at: '2026-10-21T12:00:00.000Z',
   finished_at: '2026-10-21T12:03:00.000Z',
   ...patch,
})

const reserve = (
   sessionId: string,
   now: Date,
   budget: TaskBudget = ACTION,
   trigger: 'manual' | 'automatic' = 'manual'
) =>
   PrismaService.client.$transaction(tx =>
      BrowseBudgetService.reserve(tx, {
         accountId,
         sessionId,
         budget,
         trigger,
         now,
      })
   )

// The session ended a few minutes after it was asked for.
const settle = (sessionId: string, patch: Record<string, unknown> = {}, endedAt = at(3)) =>
   PrismaService.client.$transaction(tx => BrowseBudgetService.settle(tx, sessionId, result(patch), endedAt))

const usage = (sessionId: string) => PrismaService.client.browseUsage.findUnique({ where: { sessionId } })

describe('the browsing time of an account (PostgreSQL)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{"password":"hunter2"}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: `acc-${randomUUID()}@example.com`,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
               officeTimeZone: 'UTC',
            },
         })
      ).id
   })

   beforeEach(async () => {
      await PrismaService.client.browseUsage.deleteMany({ where: { linkedInAccountId: accountId } })
      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { browseMode: 'SAFE' },
      })
   })

   afterAll(async () => {
      await PrismaService.client.user.delete({ where: { id: userId } })
   })

   it('should book the estimate of a session when it is asked for, under the day of the account', async () => {
      const id = randomUUID()

      await reserve(id, WEDNESDAY_NOON)

      await expect(usage(id)).resolves.toMatchObject({
         linkedInAccountId: accountId,
         day: '2026-10-21',
         class: 'ACTION',
         seconds: 300,
         source: 'ESTIMATED',
         settledAt: null,
      })
   })

   it('should refuse outside the working hours, say when it can start, and book nothing', async () => {
      const id = randomUUID()
      const refused = await reserve(id, SATURDAY_NOON).catch((error: unknown) => error)

      expect(refused).toBeInstanceOf(BrowseBudgetError)
      expect(refused).toMatchObject({
         reason: 'OUTSIDE_OFFICE',
         message: expect.stringContaining('on Mon 26 Oct at 09:'),
      })
      await expect(usage(id)).resolves.toBeNull()
   })

   it('should count a sign-in check even outside the working hours, and never refuse it', async () => {
      const id = randomUUID()

      await reserve(
         id,
         SATURDAY_NOON,
         {
            estimate_s: 120,
            class: 'SYSTEM',
         },
         'automatic'
      )

      await expect(usage(id)).resolves.toMatchObject({ class: 'SYSTEM' })
   })

   it('should count a read the owner asked for as an action, and only a scheduled one as background', async () => {
      const asked = randomUUID()
      const scheduled = randomUUID()
      const background: TaskBudget = {
         estimate_s: 120,
         class: 'BACKGROUND',
      }

      await reserve(asked, WEDNESDAY_NOON, background, 'manual')
      await settle(asked)
      await reserve(scheduled, at(20), background, 'automatic')

      await expect(usage(asked)).resolves.toMatchObject({ class: 'ACTION' })
      await expect(usage(scheduled)).resolves.toMatchObject({ class: 'BACKGROUND' })
   })

   it('should not start a second session while one runs, and once it ended only after the gap', async () => {
      const first = randomUUID()

      await reserve(first, WEDNESDAY_NOON)
      await expect(reserve(randomUUID(), at(1))).rejects.toMatchObject({ reason: 'GAP' })

      await settle(first, { browser_seconds: 120 })

      await expect(usage(first)).resolves.toMatchObject({
         seconds: 120,
         source: 'MEASURED',
      })
      await expect(reserve(randomUUID(), at(4))).rejects.toMatchObject({ reason: 'GAP' })
      await expect(reserve(randomUUID(), at(60))).resolves.toBeUndefined()
   })

   it('should let only one of two requests at the same moment through', async () => {
      const outcomes = await Promise.allSettled([reserve(randomUUID(), at(120)), reserve(randomUUID(), at(120))])

      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.find(({ status }) => status === 'rejected')).toMatchObject({ reason: { reason: 'GAP' } })
   })

   it('should stop a day that is full, until the next office start, and open it again with a higher mode', async () => {
      const done = randomUUID()

      await reserve(done, WEDNESDAY_NOON)
      await settle(done, { browser_seconds: 90 * 60 })

      await expect(reserve(randomUUID(), at(60))).rejects.toMatchObject({ reason: 'DAY_FULL' })

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { browseMode: 'MODERATE' },
      })

      await expect(reserve(randomUUID(), at(300))).resolves.toBeUndefined()
   })

   it('should book a session that never reached the browser as nothing, and a worker without a time by its run', async () => {
      const queued = randomUUID()
      const old = randomUUID()

      await reserve(queued, WEDNESDAY_NOON)
      await settle(queued, { verdict: 'NEEDS_PROXY' })
      await reserve(old, at(60))
      await settle(old, { finished_at: '2026-10-21T12:04:00.000Z' }, at(64))

      await expect(usage(queued)).resolves.toMatchObject({
         seconds: 0,
         source: 'NONE',
      })
      await expect(usage(old)).resolves.toMatchObject({
         seconds: 240,
         source: 'ESTIMATED',
      })
   })

   it('should book zero when the session ended without an answer from the worker, and book an answer only once', async () => {
      const lost = randomUUID()

      await reserve(lost, WEDNESDAY_NOON)
      await BrowseBudgetService.release(lost)

      await expect(usage(lost)).resolves.toMatchObject({
         seconds: 0,
         source: 'NONE',
      })

      await settle(lost, { browser_seconds: 500 })

      await expect(usage(lost)).resolves.toMatchObject({ seconds: 0 })
   })
})
