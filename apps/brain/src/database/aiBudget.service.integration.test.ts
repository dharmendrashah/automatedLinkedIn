import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AiBudgetService } from './aiBudget.service'
import { PlatformSettingService } from './platformSetting.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. What With AI may still spend: the switch, the caps of an owner and of the platform, and the previews of a day.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string

const spend = (owner: string, amountMicros: number, preview = false) =>
   AiBudgetService.record(owner, {
      id: randomUUID(),
      workflowId: 'w1',
      runId: 'r1',
      amountMicros,
      label: 'AI comments',
      preview,
   })

describe('AI budget (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should have room until an owner reaches the day cap, and only for that owner', async () => {
      await PlatformSettingService.setAi({ ownerDayMicros: 1_000 }, 'admin@elitale.com')

      expect(await AiBudgetService.room(userId)).toBe('OK')

      await spend(userId, 1_000)

      expect(await AiBudgetService.room(userId)).toBe('LIMIT')
      expect(await AiBudgetService.room(otherUserId)).toBe('OK')
   })

   it('should stop everyone when the platform cap is reached', async () => {
      await PlatformSettingService.setAi(
         {
            ownerDayMicros: 1_000_000,
            platformDayMicros: 1_500,
         },
         'admin@elitale.com'
      )
      await spend(otherUserId, 600)

      expect(await AiBudgetService.room(otherUserId)).toBe('LIMIT')
      expect(await AiBudgetService.room(randomUUID())).toBe('LIMIT')
   })

   it('should say paused when the admin switches it off, whatever was spent', async () => {
      await PlatformSettingService.setAi({ on: false }, 'admin@elitale.com')

      expect(await AiBudgetService.room(userId)).toBe('PAUSED')
      expect((await PlatformSettingService.ai()).on).toBe(false)
   })

   it('should book a call once, and count the previews of a day', async () => {
      const id = randomUUID()
      const call = {
         id,
         workflowId: 'w1',
         runId: 'r1',
         amountMicros: 5,
         label: 'AI comments',
         preview: false,
      }

      await AiBudgetService.record(userId, call)
      await AiBudgetService.record(userId, call)

      expect(await db.spendLedger.count({ where: { callId: `ai:${id}` } })).toBe(1)
      expect(await AiBudgetService.previewRoom(userId)).toBe(true)

      for (let each = 0; each < 30; each += 1) {
         await spend(userId, 0, true)
      }

      expect(await AiBudgetService.previewRoom(userId)).toBe(false)
      expect(await AiBudgetService.previewRoom(otherUserId)).toBe(true)
   })
})
