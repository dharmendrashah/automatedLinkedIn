import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConflictError } from './conflict'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PersonService, type ProfileReader } from './person.service'
import { PrismaService } from './prisma.service'
import { RetentionService } from './retention.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const url = (slug: string) => `https://www.linkedin.com/in/${slug}`

const fakeReader = (costMicros = 4_000) => ({
   collect: vi.fn<ProfileReader['collect']>(async () => ({
      jobId: 'job-1',
      status: 'completed' as const,
      rows: [
         {
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
         },
      ],
      costMicros,
      error: null,
   })),
})

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

   it('should pay one full read a day, book it, and keep only the allow-listed fields', async () => {
      const reader = fakeReader()
      const read = await PersonService.readFull(userId, 'ada', reader)
      const ledger = await PrismaService.client.spendLedger.findMany({ where: { userId } })

      expect(read?.snapshot).toMatchObject({
         name: 'Ada Lovelace',
         about: 'I write programs.',
         experience: [expect.objectContaining({ title: 'Analyst' })],
      })
      expect(JSON.stringify(read?.snapshot)).not.toContain('ada@example.com')
      expect(ledger).toEqual([
         expect.objectContaining({
            amountMicros: 4_000,
            workflowId: null,
            runId: null,
         }),
      ])
      await expect(PersonService.readFull(userId, 'ada', reader)).rejects.toBeInstanceOf(ConflictError)
      expect(reader.collect).toHaveBeenCalledTimes(1)
   })

   it('should let the owner try again when a read failed before anything was paid', async () => {
      const failing = {
         collect: vi.fn<ProfileReader['collect']>(async () => {
            throw new Error('network')
         }),
      }

      await expect(PersonService.readFull(userId, 'bob', failing)).rejects.toThrow('network')
      expect(await PrismaService.client.spendLedger.count({ where: { userId } })).toBe(1)
      expect((await PersonService.readFull(userId, 'bob', fakeReader()))?.snapshot?.name).toBe('Ada Lovelace')
   })

   it('should delete the full profile on do not contact and when the person is kept nowhere', async () => {
      const member = await WorkflowListService.memberBySlug(userId, 'ada')

      await WorkflowListService.doNotContact(userId, member?.id ?? '')

      const bob = await LinkedInProfileService.bySlug(userId, 'bob')

      await LinkedInProfileService.archiveForUser(userId, bob?.id ?? '')
      await RetentionService.run()

      expect(await PrismaService.client.personSnapshot.count({ where: { userId } })).toBe(0)
      expect(await PersonService.detail(userId, 'ada')).toBeNull()
      await expect(PersonService.readFull(userId, 'bob', fakeReader())).rejects.toBeInstanceOf(ConflictError)
   })
})
