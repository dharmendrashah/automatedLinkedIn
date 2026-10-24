import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInVisitHooks } from './linkedInPageVisit.hooks'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PageVisitService } from './pageVisit.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The task itself is not asked of the spider: the request runs only what brain saves with it.

const email = `${randomUUID()}@elitale.com`

let userId: string
let accountId: string
let profileId: string
let companyId: string

const asked = () =>
   vi.spyOn(TaskService, 'request').mockImplementation(async options => {
      const id = randomUUID()

      await PrismaService.client.$transaction(async tx => {
         await options.onStart?.(id, tx)
      })

      return { id }
   })

describe('page visits (database)', () => {
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
      companyId = (
         await PrismaService.client.linkedInCompany.create({
            data: {
               userId,
               slug: 'analytical-engines',
               url: 'https://www.linkedin.com/company/analytical-engines',
            },
         })
      ).id
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should save the visit with the session, show it on the profile, and refuse the same person again', async () => {
      const request = asked()
      const { id } = (await PageVisitService.request(userId, accountId, { profileId })) ?? {}

      expect(request).toHaveBeenCalledWith(
         expect.objectContaining({
            task: 'linkedin-view-profile',
            input: { profileUrl: 'https://www.linkedin.com/in/ada-lovelace/' },
         })
      )
      await expect(
         PrismaService.client.linkedInPageVisit.findUnique({ where: { sessionId: id } })
      ).resolves.toMatchObject({
         status: 'ASKED',
         slug: 'ada-lovelace',
         profileId,
      })

      const saved = await LinkedInProfileService.getForUser(userId, profileId)

      expect(saved?.visits[0]).toMatchObject({ status: 'ASKED' })
      await expect(
         PageVisitService.request(userId, accountId, {
            kind: 'PROFILE',
            link: 'linkedin.com/in/Ada-Lovelace',
         })
      ).rejects.toThrow('already viewed that profile')

      await PrismaService.client.$transaction(async tx => {
         await linkedInVisitHooks.onResult?.(
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
         PrismaService.client.linkedInPageVisit.findUnique({ where: { sessionId: id } })
      ).resolves.toMatchObject({
         status: 'DONE',
         finishedAt: expect.any(Date),
      })
   })

   it('should save a company visit under the company, show it, and refuse the same company again but not the same name as a profile', async () => {
      const request = asked()
      const { id } = (await PageVisitService.request(userId, accountId, { companyId })) ?? {}

      expect(request).toHaveBeenCalledWith(
         expect.objectContaining({
            task: 'linkedin-view-company',
            input: { companyUrl: 'https://www.linkedin.com/company/analytical-engines/' },
         })
      )
      await expect(
         PrismaService.client.linkedInPageVisit.findUnique({ where: { sessionId: id } })
      ).resolves.toMatchObject({
         kind: 'COMPANY',
         slug: 'analytical-engines',
         companyId,
         profileId: null,
      })
      await expect(
         PageVisitService.request(userId, accountId, {
            kind: 'COMPANY',
            link: 'linkedin.com/company/Analytical-Engines',
         })
      ).rejects.toThrow('already viewed that company page')

      // The same name as a profile is another page: the 30 day rule is kept by kind.
      await expect(
         PageVisitService.request(userId, accountId, {
            kind: 'PROFILE',
            link: 'linkedin.com/in/analytical-engines',
         })
      ).resolves.toMatchObject({ id: expect.any(String) })
   })

   it('should refuse the 16th visit of an account in 24 hours, profiles and companies together', async () => {
      asked()
      await PrismaService.client.linkedInPageVisit.createMany({
         data: Array.from({ length: 11 }, (_, index) => ({
            userId,
            accountId,
            slug: `someone-${index}`,
            sessionId: randomUUID(),
            status: 'FAILED' as const,
         })),
      })

      // 3 earlier visits and 11 here make 14: one more is allowed, the next is not.
      await expect(
         PageVisitService.request(userId, accountId, {
            kind: 'PROFILE',
            link: 'linkedin.com/in/grace-hopper',
         })
      ).resolves.toMatchObject({ id: expect.any(String) })
      await expect(
         PageVisitService.request(userId, accountId, {
            kind: 'COMPANY',
            link: 'linkedin.com/company/other-company',
         })
      ).rejects.toThrow('limit of 15 page views')
   })

   it('should keep the visits when the saved profile or company is deleted, and remove them with the account', async () => {
      await PrismaService.client.linkedInProfile.delete({ where: { id: profileId } })
      await PrismaService.client.linkedInCompany.delete({ where: { id: companyId } })

      await expect(
         PrismaService.client.linkedInPageVisit.findFirst({ where: { slug: 'ada-lovelace' } })
      ).resolves.toMatchObject({ profileId: null })
      await expect(
         PrismaService.client.linkedInPageVisit.findFirst({
            where: {
               slug: 'analytical-engines',
               kind: 'COMPANY',
            },
         })
      ).resolves.toMatchObject({ companyId: null })

      await PrismaService.client.linkedInAccount.delete({ where: { id: accountId } })

      await expect(PrismaService.client.linkedInPageVisit.count({ where: { userId } })).resolves.toBe(0)
   })
})
