import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LinkedInAccountService } from './linkedInAccount.service'
import { PostDraftService } from './postDraft.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const blocks = [
   {
      id: 't1',
      type: 'TEXT' as const,
      text: 'Hello',
   },
]

let userId: string
let otherUserId: string
let accountId: string
let otherAccountId: string

const input = (overrides: Partial<Parameters<typeof PostDraftService.save>[1]> = {}) => ({
   accountId,
   blocks,
   audience: 'ANYONE' as const,
   comments: 'ANYONE' as const,
   plannedAt: null,
   plannedZone: null,
   ...overrides,
})

describe('PostDraftService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await LinkedInAccountService.create(userId, `${randomUUID()}@example.com`, { password: 'x' })).id
      otherAccountId = (
         await LinkedInAccountService.create(otherUserId, `${randomUUID()}@example.com`, { password: 'x' })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should create, change, list and remove a draft, with the planned time kept', async () => {
      const created = await PostDraftService.save(userId, input())

      expect(created?.blocks).toEqual(blocks)

      const changed = await PostDraftService.save(
         userId,
         input({
            id: created?.id,
            plannedAt: '2026-11-03T09:00:00.000Z',
            plannedZone: 'Asia/Kolkata',
         })
      )

      expect(changed).toMatchObject({
         id: created?.id,
         plannedAt: '2026-11-03T09:00:00.000Z',
         plannedZone: 'Asia/Kolkata',
      })
      expect((await PostDraftService.list(userId)).items.map(({ id }) => id)).toEqual([created?.id])
      expect(await PostDraftService.remove(userId, created?.id ?? '')).toBe(true)
      expect(await PostDraftService.get(userId, created?.id ?? '')).toBeNull()
   })

   it('should keep who can see and who can comment, anyone unless it was changed', async () => {
      const created = await PostDraftService.save(userId, input())

      expect(created).toMatchObject({
         audience: 'ANYONE',
         comments: 'ANYONE',
      })

      const changed = await PostDraftService.save(
         userId,
         input({
            id: created?.id,
            audience: 'CONNECTIONS',
            comments: 'CONNECTIONS',
         })
      )

      expect(changed).toMatchObject({
         audience: 'CONNECTIONS',
         comments: 'CONNECTIONS',
      })
      expect(await PostDraftService.get(userId, created?.id ?? '')).toMatchObject({
         audience: 'CONNECTIONS',
         comments: 'CONNECTIONS',
      })
   })

   it('should never let one owner read, change, delete or attach to the drafts and accounts of another', async () => {
      const mine = await PostDraftService.save(userId, input())

      expect(await PostDraftService.get(otherUserId, mine?.id ?? '')).toBeNull()
      expect(await PostDraftService.save(otherUserId, input({ id: mine?.id }))).toBeNull()
      expect(await PostDraftService.save(userId, input({ accountId: otherAccountId }))).toBeNull()
      expect(await PostDraftService.remove(otherUserId, mine?.id ?? '')).toBe(false)
      expect((await PostDraftService.list(otherUserId)).items).toEqual([])
      expect(await PostDraftService.get(userId, mine?.id ?? '')).not.toBeNull()
   })

   it('should delete the drafts of an account with the account', async () => {
      const mine = await PostDraftService.save(userId, input())

      await PrismaService.client.linkedInAccount.delete({ where: { id: accountId } })

      expect(await PostDraftService.get(userId, mine?.id ?? '')).toBeNull()
   })
})
