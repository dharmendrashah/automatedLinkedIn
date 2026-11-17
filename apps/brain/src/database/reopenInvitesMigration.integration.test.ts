import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. Runs the text of the migration itself, so the test cannot drift from it.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const sql = readFileSync(
   join(__dirname, '../../prisma/migrations/20261117100000_reopen_invites_without_more_menu/migration.sql'),
   'utf8'
)
const NO_CONNECT = 'LinkedIn showed no Connect button on the profile. Nothing was sent.'

let userId: string
let accountId: string

const invite = (slug: string, state: 'FAILED' | 'SENT', reason: string | null, createdAt: Date) =>
   db.linkedInInvite.create({
      data: {
         userId,
         accountId,
         slug,
         name: slug,
         state,
         reason,
         plannedAt: createdAt,
         createdAt,
      },
   })

const row = (slug: string) =>
   db.linkedInInvite.findFirstOrThrow({
      where: {
         userId,
         slug,
      },
   })

describe('the migration that reopens invites ended without the More menu (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{}')

      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id
      await invite('no-more-menu', 'FAILED', NO_CONNECT, new Date('2026-11-14T10:00:00Z'))
      await invite('other-failure', 'FAILED', 'LinkedIn asked for the same notes.', new Date('2026-11-14T10:00:00Z'))
      await invite('before-the-change', 'FAILED', NO_CONNECT, new Date('2026-11-09T10:00:00Z'))
      await invite('sent', 'SENT', null, new Date('2026-11-14T10:00:00Z'))
      await db.peopleIndexDirty.deleteMany({ where: { userId } })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should make only the no Connect failures since 10 Nov askable again, mark them for the people index, and be safe to run again', async () => {
      await db.$executeRawUnsafe(sql)
      await db.$executeRawUnsafe(sql)

      expect(await row('no-more-menu')).toMatchObject({
         state: 'SKIPPED',
         reason: 'Asked again after the More menu fix.',
      })
      expect(await row('other-failure')).toMatchObject({ state: 'FAILED' })
      expect(await row('before-the-change')).toMatchObject({ state: 'FAILED' })
      expect(await row('sent')).toMatchObject({ state: 'SENT' })
      expect((await db.peopleIndexDirty.findMany({ where: { userId } })).map(({ slug }) => slug)).toEqual([
         'no-more-menu',
      ])
   })
})
