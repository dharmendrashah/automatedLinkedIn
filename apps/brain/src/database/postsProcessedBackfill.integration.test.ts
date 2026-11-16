import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CampaignService } from './campaign.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. Runs the text of the backfill migration itself, so the test cannot drift from it.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const sql = readFileSync(
   join(__dirname, '../../prisma/migrations/20261116200000_posts_processed_backfill/migration.sql'),
   'utf8'
)

let userId: string
let otherId: string
let label: string

const post = (owner: string, slug: string, tags: string[], status: 'UNPROCESSED' | 'PROCESSED' = 'UNPROCESSED') =>
   db.linkedInPost.create({
      data: {
         userId: owner,
         slug,
         url: `https://www.linkedin.com/feed/update/urn:li:activity:${slug}`,
         tags,
         status,
      },
   })

const statusOf = async (slug: string) =>
   (
      await db.linkedInPost.findFirstOrThrow({
         where: {
            slug,
            userId: { in: [userId, otherId] },
         },
      })
   ).status

describe('the posts processed backfill (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherId = (await UserService.create({ email: otherEmail })).id
      const campaign = await CampaignService.create(userId, { name: 'Backfill campaign' })

      ;({ label } = campaign)
      await post(userId, 'activity-1', [label])
      await post(userId, 'activity-2', [])
      await post(userId, 'activity-3', ['somebody-elses-label'])
      await post(otherId, 'activity-4', [label])
      await post(userId, 'activity-5', [label], 'PROCESSED')
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it("should mark only the posts that carry one of the same owner's campaign labels, and be safe to run again", async () => {
      await db.$executeRawUnsafe(sql)
      await db.$executeRawUnsafe(sql)

      expect(await statusOf('activity-1')).toBe('PROCESSED')
      expect(await statusOf('activity-2')).toBe('UNPROCESSED')
      expect(await statusOf('activity-3')).toBe('UNPROCESSED')
      expect(await statusOf('activity-4')).toBe('UNPROCESSED')
      expect(await statusOf('activity-5')).toBe('PROCESSED')
   })
})
