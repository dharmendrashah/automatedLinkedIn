import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CompanyPageService } from './companyPage.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'

// Needs PostgreSQL (.plan/companies-import-csv.md).

const email = `${randomUUID()}@elitale.com`
const url = (slug: string) => `https://www.linkedin.com/company/${slug}/`

let userId: string

const queued = () =>
   PrismaService.client.dataRead.findMany({
      where: {
         userId,
         status: 'QUEUED',
      },
      select: { slug: true },
      orderBy: { slug: 'asc' },
   })

describe('companies import (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      await LinkedInCompanyService.addMany(userId, [
         {
            slug: 'live',
            url: url('live'),
         },
         {
            slug: 'gone',
            url: url('gone'),
         },
      ])

      const gone = await PrismaService.client.linkedInCompany.findFirstOrThrow({
         where: {
            userId,
            slug: 'gone',
         },
      })

      await LinkedInCompanyService.archiveForUser(userId, gone.id)
      await LinkedInCompanyService.updateForUser(userId, gone.id, { notes: 'Old note' })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should preview each company once with its state and keep the entries that are not company links', async () => {
      await expect(
         LinkedInCompanyService.preview(userId, [url('new'), 'linkedin.com/company/NEW', url('live'), url('gone'), 'x'])
      ).resolves.toEqual({
         companies: [
            expect.objectContaining({
               slug: 'new',
               state: 'NEW',
               inputs: [url('new'), 'linkedin.com/company/NEW'],
            }),
            expect.objectContaining({
               slug: 'live',
               state: 'ALREADY_HERE',
            }),
            expect.objectContaining({
               slug: 'gone',
               state: 'ARCHIVED',
            }),
         ],
         invalid: ['x'],
      })
   })

   it('should add, restore and label the companies, append notes once and say which were fresh', async () => {
      const entries = [
         {
            url: url('new'),
            labels: ['saas'],
            notes: 'Met at SaaStr',
         },
         {
            url: url('live'),
            labels: ['tier1'],
         },
         {
            url: url('gone'),
            notes: 'New note',
         },
         { url: 'linkedin.com/in/ada' },
      ]

      await expect(LinkedInCompanyService.importMany(userId, entries, ['import'])).resolves.toEqual({
         created: 1,
         restored: 1,
         skipped: 1,
         invalid: 1,
         full: 0,
         slugs: ['new', 'live', 'gone'],
         fresh: ['new', 'gone'],
      })
      await expect(LinkedInCompanyService.importMany(userId, entries, ['import'])).resolves.toMatchObject({
         created: 0,
         restored: 0,
         skipped: 3,
         fresh: [],
      })

      const rows = await PrismaService.client.linkedInCompany.findMany({
         where: { userId },
         select: {
            slug: true,
            tags: true,
            notes: true,
            archivedAt: true,
         },
         orderBy: { slug: 'asc' },
      })

      expect(rows).toEqual([
         {
            slug: 'gone',
            tags: ['import'],
            notes: 'Old note\nNew note',
            archivedAt: null,
         },
         {
            slug: 'live',
            tags: ['import', 'tier1'],
            notes: null,
            archivedAt: null,
         },
         {
            slug: 'new',
            tags: ['import', 'saas'],
            notes: 'Met at SaaStr',
            archivedAt: null,
         },
      ])
   })

   it('should read each matched company once and skip one read in the last 30 days', async () => {
      await PrismaService.client.dataRead.create({
         data: {
            userId,
            kind: 'COMPANY',
            slug: 'live',
            operation: 'companies',
            params: {},
            status: 'DONE',
            costMicros: 4_000,
            finishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
         },
      })

      const all = { slug: { in: ['new', 'live', 'gone'] } }

      await expect(CompanyPageService.readMany(userId, all)).resolves.toEqual({
         reading: 2,
         readRecently: 1,
         paused: 0,
      })
      // A second click finds the queued reads and charges nothing more.
      await expect(CompanyPageService.readMany(userId, all)).resolves.toMatchObject({ reading: 2 })
      await expect(queued()).resolves.toEqual([{ slug: 'gone' }, { slug: 'new' }])
   })
})
