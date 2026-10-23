import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { JobMonitorService } from './jobMonitor.service'
import { JobRunService } from './jobRun.service'
import { LinkedInAccountService } from './linkedInAccount.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

const job = `test-job-${randomUUID()}`
const emailA = `${randomUUID()}@elitale.com`
const emailB = `${randomUUID()}@elitale.com`
const NOW = new Date('2026-10-24T12:00:00Z')

describe('cron monitor (database)', () => {
   afterAll(async () => {
      await PrismaService.client.jobRun.deleteMany({ where: { job } })
      await PrismaService.client.user.deleteMany({ where: { email: { in: [emailA, emailB] } } })
      await PrismaService.disconnect()
   })

   it('should save runs with their items and show them in the overview, the run list and the run', async () => {
      const user = await UserService.create({ email: emailA })
      const credentials = { password: 'x' }
      const { id: accountId } = await LinkedInAccountService.create(user.id, `${randomUUID()}@work.com`, credentials)

      await JobRunService.announce([
         {
            name: job,
            title: 'Test job',
            purpose: 'Only for the test.',
            everyMs: 600_000,
            timeoutMs: 60_000,
         },
      ])
      await JobRunService.recordMany(
         [
            {
               job,
               startedAt: new Date('2026-10-24T11:40:00Z'),
               finishedAt: new Date('2026-10-24T11:40:01Z'),
               outcome: 'IDLE',
            },
            {
               job,
               startedAt: new Date('2026-10-24T11:50:00Z'),
               finishedAt: new Date('2026-10-24T11:50:02Z'),
               outcome: 'WORKED',
               summary: '1 message reads asked for',
               counts: { reads: 1 },
               items: [
                  {
                     userId: user.id,
                     accountId,
                     action: 'messages-read',
                     result: 'ASKED',
                  },
               ],
            },
            {
               job,
               startedAt: new Date('2026-10-24T11:55:00Z'),
               finishedAt: new Date('2026-10-24T11:55:01Z'),
               outcome: 'FAILED',
               error: new Error('connect failed amqp://user:secret@rabbit:5672/x'),
            },
         ],
         {
            instance: 'pod-1',
            build: 'abc1234',
         }
      )

      const overview = await JobMonitorService.overview(NOW)
      const entry = overview.jobs.find(({ name }) => name === job)

      expect(entry).toMatchObject({
         title: 'Test job',
         schedule: 'every 10 minutes',
         health: 'FAILING',
         failureStreak: 1,
         last24h: {
            runs: 3,
            worked: 1,
            failed: 1,
         },
      })
      expect(entry?.hours).toHaveLength(24)
      expect(overview.worker).toBe('RUNNING')

      const list = await JobMonitorService.runs({
         job,
         includeIdle: false,
         limit: 10,
      })

      expect(list.runs.map(({ outcome }) => outcome)).toEqual(['FAILED', 'WORKED'])
      expect(list.runs[0].error).not.toContain('secret')

      const withIdle = await JobMonitorService.runs({
         job,
         includeIdle: true,
         limit: 2,
      })

      expect(withIdle.runs).toHaveLength(2)
      expect(withIdle.next).not.toBeNull()

      const worked = list.runs.find(({ outcome }) => outcome === 'WORKED')
      const detail = await JobMonitorService.run(worked?.id ?? '')

      expect(detail).toMatchObject({
         instance: 'pod-1',
         counts: { reads: 1 },
         items: [
            {
               action: 'messages-read',
               result: 'ASKED',
               user: emailA,
            },
         ],
      })
   })

   it('should delete runs past 30 days and keep the rest', async () => {
      await JobRunService.recordMany(
         [
            {
               job,
               startedAt: new Date('2026-09-01T00:00:00Z'),
               finishedAt: new Date('2026-09-01T00:00:01Z'),
               outcome: 'IDLE',
            },
         ],
         {
            instance: 'pod-1',
            build: 'abc1234',
         }
      )

      await JobRunService.cleanup(NOW)

      const left = await PrismaService.client.jobRun.findMany({ where: { job } })

      expect(left.every(({ startedAt }) => startedAt >= new Date('2026-09-24T12:00:00Z'))).toBe(true)
      expect(left.length).toBeGreaterThan(0)
   })

   it('should leave an account that is not active out of the message reads', async () => {
      const [account] = (await JobMonitorService.messageReads(NOW)).filter(({ user }) => user === emailA)

      // The account of the first test is still pending, so it is not scheduled and not listed.
      expect(account).toBeUndefined()
   })

   it('should allow exactly one admin, and move the role to the new owner', async () => {
      const a = await UserService.create({
         email: emailA.replace('@', '+2@'),
         authentikId: randomUUID(),
      })
      const b = await UserService.create({
         email: emailB,
         authentikId: randomUUID(),
      })

      try {
         await UserService.syncAdmin(a.email)

         expect((await UserService.findById(a.id))?.role).toBe('ADMIN')

         await expect(
            PrismaService.client.user.update({
               where: { id: b.id },
               data: { role: 'ADMIN' },
            })
         ).rejects.toThrow()

         await UserService.syncAdmin(emailB)

         expect((await UserService.findById(a.id))?.role).toBe('USER')
         expect((await UserService.findById(b.id))?.role).toBe('ADMIN')
      } finally {
         await PrismaService.client.user.deleteMany({ where: { id: { in: [a.id, b.id] } } })
      }
   })

   it('should not promote a user that is not linked to a login', async () => {
      const unlinked = await UserService.create({ email: `${randomUUID()}@elitale.com` })

      try {
         await UserService.syncAdmin(unlinked.email)

         expect((await UserService.findById(unlinked.id))?.role).toBe('USER')
      } finally {
         await PrismaService.client.user.delete({ where: { id: unlinked.id } })
      }
   })
})
