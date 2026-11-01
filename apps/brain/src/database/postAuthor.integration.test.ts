import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { type Prisma } from 'generated/prisma/client'

import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { FROM_POSTS, PostAuthorService } from './postAuthor.service'
import { PostPageService } from './postPage.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { workReads } from './workReads'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const migratedEmail = `${randomUUID()}@elitale.com`
const MIGRATION = join(__dirname, '../../prisma/migrations/20261101210000_add_post_authors/migration.sql')
const POST_SLUG = 'activity-7452924970042826760'
const POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826760'

const author = (url: string, isCompany = false) => ({
   name: 'Grace',
   url,
   avatar: null,
   headline: 'Compilers',
   followers: null,
   isCompany,
})

const queuedReads = (kind: 'PROFILE' | 'COMPANY', slug: string) =>
   PrismaService.client.dataRead.count({
      where: {
         userId,
         kind,
         slug,
      },
   })

let userId: string

describe('PostAuthorService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, migratedEmail] } } })
      await PrismaService.disconnect()
   })

   it('should add the author of a read post to My network, read their profile, and show them in the drawer', async () => {
      await LinkedInPostService.addMany(userId, [
         {
            slug: POST_SLUG,
            url: POST_URL,
         },
      ])
      await PostPageService.readFull(userId, POST_SLUG)
      await workReads(
         userId,
         fakeDataClient(() => ({
            rows: [
               {
                  postText: 'Hello',
                  authorName: 'Grace Hopper',
                  authorUrl: 'https://www.linkedin.com/in/grace-hopper',
                  authorType: 'person',
               },
            ],
            costMicros: 2_000,
         }))
      )

      await expect(
         PrismaService.client.linkedInProfile.findUnique({
            where: {
               userId_slug: {
                  userId,
                  slug: 'grace-hopper',
               },
            },
            select: {
               tags: true,
               clientId: true,
            },
         })
      ).resolves.toEqual({
         tags: [FROM_POSTS],
         clientId: null,
      })
      expect(await queuedReads('PROFILE', 'grace-hopper')).toBe(1)
      expect((await PostPageService.detail(userId, POST_SLUG))?.author).toMatchObject({
         kind: 'person',
         slug: 'grace-hopper',
         name: 'Grace Hopper',
         readAt: expect.any(Date),
         reading: false,
      })

      // A second read of the same post finds the author known: nothing is added or read again.
      await PostAuthorService.keep(userId, author('https://www.linkedin.com/in/grace-hopper'))
      expect(await queuedReads('PROFILE', 'grace-hopper')).toBe(1)
   })

   it('should add and read a company author once, and leave a suppressed person alone', async () => {
      await PostAuthorService.keep(userId, author('https://www.linkedin.com/company/acme', true))
      await PostAuthorService.keep(userId, author('https://www.linkedin.com/company/acme', true))

      expect((await LinkedInCompanyService.bySlug(userId, 'acme'))?.tags).toEqual([FROM_POSTS])
      expect(await queuedReads('COMPANY', 'acme')).toBe(1)

      await PrismaService.client.suppression.create({
         data: {
            userId,
            slug: 'blocked',
         },
      })
      await PostAuthorService.keep(userId, author('https://www.linkedin.com/in/blocked'))

      expect(
         await PrismaService.client.linkedInProfile.count({
            where: {
               userId,
               slug: 'blocked',
            },
         })
      ).toBe(0)
      expect(await queuedReads('PROFILE', 'blocked')).toBe(0)
   })

   it('should add the authors of posts read before this change once, without reads', async () => {
      const owner = (await UserService.create({ email: migratedEmail })).id
      const post = (slug: string, url: string | null, isCompany = false): Prisma.PageSnapshotCreateManyInput => ({
         userId: owner,
         kind: 'POST',
         slug,
         data: {
            author: {
               name: 'Someone',
               url,
               avatar: null,
               headline: null,
               followers: null,
               isCompany,
            },
         },
      })

      await PrismaService.client.linkedInProfile.create({
         data: {
            userId: owner,
            slug: 'already-saved',
            url: 'https://www.linkedin.com/in/already-saved',
            tags: ['mine'],
         },
      })
      await PrismaService.client.linkedInCompany.create({
         data: {
            userId: owner,
            slug: 'old-co',
            url: 'https://www.linkedin.com/company/old-co',
            archivedAt: new Date(),
         },
      })
      await PrismaService.client.suppression.create({
         data: {
            userId: owner,
            slug: 'blocked-one',
         },
      })
      await PrismaService.client.pageSnapshot.createMany({
         data: [
            post('activity-1', 'https://www.linkedin.com/in/Ada-Lovelace?miniProfileUrn=urn'),
            post('activity-2', 'https://www.linkedin.com/in/already-saved'),
            post('activity-3', 'https://www.linkedin.com/in/blocked-one'),
            post('activity-4', 'https://www.linkedin.com/company/acme-labs', true),
            post('activity-5', 'https://www.linkedin.com/company/old-co', true),
            post('activity-6', 'https://www.linkedin.com/in/%C3%BCber'),
            post('activity-7', null),
         ],
      })

      const sql = await readFile(MIGRATION, 'utf8')

      await PrismaService.client.$executeRawUnsafe(sql)
      await PrismaService.client.$executeRawUnsafe(sql)

      await expect(
         PrismaService.client.linkedInProfile.findMany({
            where: { userId: owner },
            orderBy: { slug: 'asc' },
            select: {
               slug: true,
               tags: true,
               clientId: true,
            },
         })
      ).resolves.toEqual([
         {
            slug: 'ada-lovelace',
            tags: [FROM_POSTS],
            clientId: null,
         },
         {
            slug: 'already-saved',
            tags: ['mine'],
            clientId: null,
         },
      ])
      await expect(
         PrismaService.client.linkedInCompany.findMany({
            where: { userId: owner },
            orderBy: { slug: 'asc' },
            select: {
               slug: true,
               tags: true,
               archivedAt: true,
            },
         })
      ).resolves.toEqual([
         {
            slug: 'acme-labs',
            tags: [FROM_POSTS],
            archivedAt: null,
         },
         {
            slug: 'old-co',
            tags: [],
            archivedAt: expect.any(Date),
         },
      ])
      expect(await PrismaService.client.dataRead.count({ where: { userId: owner } })).toBe(0)
   })
})
