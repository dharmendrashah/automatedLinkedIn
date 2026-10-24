import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { LinkedInProfileService } from './linkedInProfile.service'
import { linkedInViewProfileHooks } from './linkedInViewProfile.hooks'
import { PrismaService } from './prisma.service'
import { ProfileVisitService } from './profileVisit.service'
import { TaskService } from './task.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The task itself is not asked of the spider: the request runs only what brain saves with it.

const email = `${randomUUID()}@elitale.com`

let userId: string
let accountId: string
let profileId: string

const asked = () =>
   vi.spyOn(TaskService, 'request').mockImplementation(async options => {
      const id = randomUUID()

      await PrismaService.client.$transaction(async tx => {
         await options.onStart?.(id, tx)
      })

      return { id }
   })

describe('profile visits (database)', () => {
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
      await LinkedInProfileService.addMany(userId, [
         {
            slug: 'ada-lovelace',
            url: 'https://www.linkedin.com/in/ada-lovelace',
         },
      ])
      profileId = (await LinkedInProfileService.bySlug(userId, 'ada-lovelace'))?.id ?? ''
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should save the visit with the session, show it on the profile, and refuse the same person again', async () => {
      const request = asked()
      const { id } = (await ProfileVisitService.request(userId, accountId, { profileId })) ?? {}

      expect(request).toHaveBeenCalledWith(
         expect.objectContaining({
            task: 'linkedin-view-profile',
            input: { profileUrl: 'https://www.linkedin.com/in/ada-lovelace/' },
         })
      )
      await expect(
         PrismaService.client.linkedInProfileVisit.findUnique({ where: { sessionId: id } })
      ).resolves.toMatchObject({
         status: 'ASKED',
         slug: 'ada-lovelace',
         profileId,
      })

      const saved = await LinkedInProfileService.getForUser(userId, profileId)

      expect(saved?.visits[0]).toMatchObject({ status: 'ASKED' })
      await expect(
         ProfileVisitService.request(userId, accountId, { link: 'linkedin.com/in/Ada-Lovelace' })
      ).rejects.toThrow('already viewed that profile')

      await PrismaService.client.$transaction(async tx => {
         await linkedInViewProfileHooks.onResult?.(
            {
               id: id ?? '',
               userId,
               linkedInAccountId: accountId,
            },
            { verdict: 'DONE' } as TaskResult,
            tx
         )
      })
      await expect(
         PrismaService.client.linkedInProfileVisit.findUnique({ where: { sessionId: id } })
      ).resolves.toMatchObject({
         status: 'DONE',
         finishedAt: expect.any(Date),
      })
   })

   it('should refuse the 16th visit of an account in 24 hours, whoever it is for', async () => {
      asked()
      await PrismaService.client.linkedInProfileVisit.createMany({
         data: Array.from({ length: 13 }, (_, index) => ({
            userId,
            accountId,
            slug: `someone-${index}`,
            sessionId: randomUUID(),
            status: 'FAILED' as const,
         })),
      })

      // 1 earlier visit and 13 here make 14: one more is allowed, the next is not.
      await expect(
         ProfileVisitService.request(userId, accountId, { link: 'linkedin.com/in/grace-hopper' })
      ).resolves.toMatchObject({ id: expect.any(String) })
      await expect(
         ProfileVisitService.request(userId, accountId, { link: 'linkedin.com/in/alan-turing' })
      ).rejects.toThrow('limit of 15 profile views')
   })

   it('should keep the visit when the saved profile is deleted, and remove it with the account', async () => {
      await PrismaService.client.linkedInProfile.delete({ where: { id: profileId } })

      await expect(
         PrismaService.client.linkedInProfileVisit.findFirst({ where: { slug: 'ada-lovelace' } })
      ).resolves.toMatchObject({ profileId: null })

      await PrismaService.client.linkedInAccount.delete({ where: { id: accountId } })

      await expect(PrismaService.client.linkedInProfileVisit.count({ where: { userId } })).resolves.toBe(0)
   })
})
