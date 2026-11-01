import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'

import { AccountProfileService } from './accountProfile.service'
import { linkedInProfileHooks } from './linkedInProfile.hooks'
import { PrismaService } from './prisma.service'
import { ProfileImportService } from './profileImport.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskRefusedError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`

const empty = {
   items: [],
   total: 0,
}
const file = (name: string, capturedAt: string) =>
   JSON.stringify({
      contract: 1,
      captured_at: capturedAt,
      profileUrl: 'https://www.linkedin.com/in/sample-person/',
      name,
      verified: false,
      topSkills: [],
      services: [],
      experience: [],
      education: [],
      projects: empty,
      skills: empty,
      recommendations: {
         received: empty,
         given: empty,
      },
      languages: empty,
      interests: {
         topVoices: [],
         companies: [],
         groups: [],
         newsletters: [],
         schools: [],
      },
      peopleYouMayKnow: [],
      youMightLike: [],
   })

let userId: string
let accountId: string

const finishedRun = async (verdict: 'DONE' | 'PARTIAL') => {
   const id = randomUUID()

   await SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-profile',
      taskVersion: 3,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })
   await PrismaService.client.spiderSessionArtifact.create({
      data: {
         sessionId: id,
         kind: 'file',
         name: 'profile.json',
         path: `runs/linkedin-profile/${userId}/2026/10/24/${id}/files/profile.json`,
         contentType: 'application/json',
         bytes: 10,
      },
   })
   await PrismaService.client.spiderSession.update({
      where: { id },
      data: {
         status: 'SUCCEEDED',
         verdict,
         finishedAt: new Date(),
      },
   })
   // A second in the past: the row's time comes from this process and "due" is read on the database clock, which can lag by a few ms.
   await PrismaService.client.profileImport.create({
      data: {
         sessionId: id,
         nextAttemptAt: new Date(Date.now() - 1000),
      },
   })

   return id
}

describe('the account profile (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
               status: 'ACTIVE',
            },
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should let the first automatic ask through once, and refuse a second one, in the database', async () => {
      const ask = (trigger: 'automatic' | 'manual') =>
         PrismaService.client.$transaction(async tx => {
            await linkedInProfileHooks.onRequest?.(
               {
                  id: randomUUID(),
                  userId,
                  accountId,
                  task: 'linkedin-profile',
                  trigger,
               },
               tx
            )
         })

      await expect(AccountProfileService.state(userId, accountId)).resolves.toMatchObject({
         phase: 'NEVER',
         firstVisit: true,
      })

      await expect(ask('automatic')).resolves.toBeUndefined()
      await expect(ask('automatic')).rejects.toBeInstanceOf(TaskRefusedError)
      await expect(ask('manual')).resolves.toBeUndefined()
      await expect(AccountProfileService.state(userId, accountId)).resolves.toMatchObject({ firstVisit: false })
   })

   it('should store the profile once for the owner, show it, and keep it against a partial or older read', async () => {
      const first = await finishedRun('DONE')

      await expect(
         ProfileImportService.importDue(undefined, async () => file('Sample Person', '2026-10-24T10:00:00Z'))
      ).resolves.toMatchObject({ done: 1 })
      await expect(
         ProfileImportService.importDue(undefined, async () => file('Other', '2026-10-24T10:00:00Z'))
      ).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })

      await expect(AccountProfileService.get(userId, accountId)).resolves.toMatchObject({
         profile: { name: 'Sample Person' },
         capturedAt: '2026-10-24T10:00:00.000Z',
      })
      await expect(AccountProfileService.get(randomUUID(), accountId)).resolves.toEqual({
         profile: null,
         capturedAt: null,
      })
      await expect(AccountProfileService.state(userId, accountId)).resolves.toMatchObject({
         phase: 'READY',
         capturedAt: '2026-10-24T10:00:00.000Z',
      })
      await expect(
         PrismaService.client.profileImport.findUnique({ where: { sessionId: first } })
      ).resolves.toMatchObject({ status: 'DONE' })

      await finishedRun('PARTIAL')
      await ProfileImportService.importDue(undefined, async () => file('Partial', '2026-10-24T11:00:00Z'))
      await finishedRun('DONE')
      await ProfileImportService.importDue(undefined, async () => file('Older', '2026-10-24T09:00:00Z'))

      const kept = await AccountProfileService.get(userId, accountId)

      expect(kept.profile?.name).toBe('Sample Person')

      await finishedRun('DONE')
      await ProfileImportService.importDue(undefined, async () => file('Newer', '2026-10-24T12:00:00Z'))

      await expect(AccountProfileService.get(userId, accountId)).resolves.toMatchObject({ profile: { name: 'Newer' } })
   })

   it('should remove the stored profile with its account', async () => {
      await PrismaService.client.linkedInAccount.delete({ where: { id: accountId } })

      await expect(PrismaService.client.linkedInAccountProfile.count({ where: { userId } })).resolves.toBe(0)
   })
})
