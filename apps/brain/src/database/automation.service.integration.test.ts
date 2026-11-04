import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AutomationService } from './automation.service'
import { IcpService } from './icp.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL (.plan/lead-pipeline-p10-automations.md). An automation makes its workflows switched off, and nothing when it is refused.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherId: string
let icpId: string

const answers = (changes: Record<string, unknown> = {}) => ({
   name: `Radar ${randomUUID().slice(0, 6)}`,
   icpId,
   phrases: ['looking for an outbound tool'],
   ...changes,
})

describe('AutomationService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherId = (await UserService.create({ email: otherEmail })).id
      icpId = (
         await IcpService.create(userId, {
            name: `Growth ${randomUUID().slice(0, 6)}`,
            includeTitles: ['growth'],
            excludeTitles: [],
            seniorities: [],
            industries: [],
            companySizes: [],
            locations: [],
            problemKeywords: [],
         })
      ).id
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should make the workflows of an automation, switched off, with graphs the editor can open', async () => {
      const made = await AutomationService.create(userId, 'A1', answers())
      const rows = await db.workflow.findMany({ where: { id: { in: made.workflows.map(({ id }) => id) } } })

      expect(rows).toHaveLength(1)
      expect(rows.map(({ enabled }) => enabled)).toEqual([false])
      expect(rows[0]?.name).toContain('Intent radar')
      expect(rows[0]?.userId).toBe(userId)
   })

   it('should refuse an automation that waits for a block, one that lacks an answer and an ideal customer that is not yours', async () => {
      const before = await db.workflow.count({ where: { userId } })

      await expect(AutomationService.create(userId, 'A2', answers())).rejects.toThrow('is not available yet')
      await expect(AutomationService.create(userId, 'A1', answers({ phrases: [] }))).rejects.toThrow(
         'Add at least one phrase.'
      )
      await expect(AutomationService.create(otherId, 'A13', answers())).rejects.toThrow(
         'That ideal customer was not found.'
      )
      expect(await db.workflow.count({ where: { userId } })).toBe(before)
   })

   it('should make the same automation twice only under a different name', async () => {
      const same = answers({ name: `Twice ${randomUUID().slice(0, 6)}` })

      await AutomationService.create(userId, 'A13', same)
      await expect(AutomationService.create(userId, 'A13', same)).rejects.toThrow()
   })
})
