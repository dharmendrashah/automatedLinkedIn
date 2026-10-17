import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { ConflictError } from './conflict'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PersonService } from './person.service'
import { PrismaService } from './prisma.service'
import { RetentionService } from './retention.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { workReads } from './workReads'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const url = (slug: string) => `https://www.linkedin.com/in/${slug}`

const ADA = {
   firstName: 'Ada',
   lastName: 'Lovelace',
   about: 'I write programs.',
   experience: [
      {
         position: 'Analyst',
         companyName: 'Engines',
      },
   ],
   email: 'ada@example.com',
}

const fakeReader = () =>
   fakeDataClient(() => ({
      rows: [ADA],
      costMicros: 4_000,
   }))

let userId: string
let listId: string

describe('PersonService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      listId = (await WorkflowListService.createList(userId, `People ${randomUUID().slice(0, 8)}`)).id
      await WalletService.save(50_000_000)
      await WorkflowListService.addFromRun(userId, listId, 'run-1', [
         {
            slug: 'ada',
            url: url('ada'),
            name: 'Ada Lovelace',
            headline: 'Head of growth',
            location: 'London',
            state: 'QUALIFIED',
            postUrl: null,
            score: 70,
            signals: [
               {
                  type: 'commented',
                  via: 'https://www.linkedin.com/posts/x',
                  at: null,
                  excerpt: 'Pipeline is hard',
               },
            ],
            title: 'Head of growth',
            company: 'Engines',
            followers: 1200,
            matched: ['title "growth"'],
            tags: [],
            known: false,
         },
      ])
      await LinkedInProfileService.addMany(userId, [
         {
            slug: 'bob',
            url: url('bob'),
         },
      ])
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should show a list member with why they were found, and nobody it does not know', async () => {
      const ada = await PersonService.detail(userId, 'ada')

      expect(ada).toMatchObject({
         url: url('ada'),
         profile: null,
         suppressed: false,
         snapshot: null,
         member: {
            title: 'Head of growth',
            company: 'Engines',
            followers: 1200,
            matched: ['title "growth"'],
            signals: [expect.objectContaining({ excerpt: 'Pipeline is hard' })],
            list: { name: expect.any(String) },
         },
      })
      expect(await PersonService.detail(userId, 'bob')).toMatchObject({
         member: null,
         profile: { slug: 'bob' },
      })
      expect(await PersonService.detail(userId, 'nobody')).toBeNull()
   })

   it('should queue one full read a day, book it when the worker ends it, and keep only the allow-listed fields', async () => {
      const reader = fakeReader()

      expect((await PersonService.readFull(userId, 'ada'))?.read?.status).toBe('QUEUED')
      // A double click joins the read already queued.
      expect((await PersonService.readFull(userId, 'ada'))?.read?.status).toBe('QUEUED')
      await workReads(userId, reader)

      const read = await PersonService.detail(userId, 'ada')
      const ledger = await PrismaService.client.spendLedger.findMany({ where: { userId } })

      expect(read?.read?.status).toBe('DONE')
      expect(read?.snapshot).toMatchObject({
         name: 'Ada Lovelace',
         about: 'I write programs.',
         experience: [expect.objectContaining({ title: 'Analyst' })],
      })
      expect(JSON.stringify(read?.snapshot)).not.toContain('ada@example.com')
      expect(ledger).toEqual([
         expect.objectContaining({
            amountMicros: 4_000,
            label: 'Profile reads',
            workflowId: null,
            runId: null,
         }),
      ])
      await expect(PersonService.readFull(userId, 'ada')).rejects.toBeInstanceOf(ConflictError)
      expect(reader.start).toHaveBeenCalledTimes(1)
   })

   it('should retry a read the data service failed without a charge, then keep it', async () => {
      let failures = 1
      const reader = fakeDataClient(() => {
         if (failures > 0) {
            failures -= 1

            return {
               rows: [],
               costMicros: 0,
               status: 'failed',
               error: 'System error',
            }
         }

         return {
            rows: [ADA],
            costMicros: 4_000,
         }
      })

      await PersonService.readFull(userId, 'bob')
      await workReads(userId, reader)
      expect((await PersonService.detail(userId, 'bob'))?.read?.status).toBe('RUNNING')

      // The pause before the retry is over.
      await PrismaService.client.dataRead.updateMany({
         where: {
            userId,
            finishedAt: null,
         },
         data: { retryAt: new Date(0) },
      })
      await workReads(userId, reader)

      expect((await PersonService.detail(userId, 'bob'))?.snapshot?.name).toBe('Ada Lovelace')
      expect(reader.start).toHaveBeenCalledTimes(2)
      expect(await PrismaService.client.spendLedger.count({ where: { userId } })).toBe(2)
   })

   it('should delete the full profile on do not contact and when the person is kept nowhere', async () => {
      const member = await WorkflowListService.memberBySlug(userId, 'ada')

      await WorkflowListService.doNotContact(userId, member?.id ?? '')

      const bob = await LinkedInProfileService.bySlug(userId, 'bob')

      await LinkedInProfileService.archiveForUser(userId, bob?.id ?? '')
      await RetentionService.run()

      expect(await PrismaService.client.personSnapshot.count({ where: { userId } })).toBe(0)
      expect(await PersonService.detail(userId, 'ada')).toBeNull()
      await expect(PersonService.readFull(userId, 'bob')).rejects.toBeInstanceOf(ConflictError)
   })
})
