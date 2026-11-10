import { WRITE_LIMITS } from '@automatedLinkedIn/contracts'

import { PlatformSettingService } from './platformSetting.service'
import { PrismaService } from './prisma.service'

// What With AI may still spend (.plan/lead-pipeline-p4-ai-drafts.md): the `ai` switch and the caps for an owner and the platform, read from
// the same ledger the Usage page shows. A tripped cap or the switch stops With AI for everyone; texts and every other block go on.

export type AiRoom = 'OK' | 'PAUSED' | 'LIMIT'

const monthOf = (date: Date) => date.toISOString().slice(0, 7)

const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

const AI_LABEL = { startsWith: 'AI ' }

// A preview asks for up to three samples.
const PREVIEW_CALLS = WRITE_LIMITS.previewsPerDay * 3

export class AiBudgetService {
   public static async room(userId: string, now = new Date()): Promise<AiRoom> {
      const settings = await PlatformSettingService.ai()

      if (!settings.on) {
         return 'PAUSED'
      }

      const db = PrismaService.client
      const sum = async (where: { userId?: string; createdAt?: { gte: Date }; month?: string }) =>
         (
            await db.spendLedger.aggregate({
               where: {
                  ...where,
                  label: AI_LABEL,
               },
               _sum: { amountMicros: true },
            })
         )._sum.amountMicros ?? 0
      const today = { gte: dayStart(now) }
      const month = monthOf(now)
      const [ownerDay, ownerMonth, platformDay, platformMonth] = await Promise.all([
         sum({
            userId,
            createdAt: today,
         }),
         sum({
            userId,
            month,
         }),
         sum({ createdAt: today }),
         sum({ month }),
      ])

      return ownerDay >= settings.ownerDayMicros ||
         ownerMonth >= settings.ownerMonthMicros ||
         platformDay >= settings.platformDayMicros ||
         platformMonth >= settings.platformMonthMicros
         ? 'LIMIT'
         : 'OK'
   }

   // Whether the owner may ask for another sample today.
   public static async previewRoom(userId: string, now = new Date()) {
      const used = await PrismaService.client.spendLedger.count({
         where: {
            userId,
            callId: { startsWith: 'ai:preview:' },
            createdAt: { gte: dayStart(now) },
         },
      })

      return used < PREVIEW_CALLS
   }

   // Books one call: a billed call is booked even when its words were dropped.
   public static async record(
      userId: string,
      call: {
         id: string
         workflowId: string | null
         runId: string | null
         amountMicros: number
         label: string
         preview: boolean
      },
      now = new Date()
   ) {
      await PrismaService.client.spendLedger.createMany({
         data: [
            {
               userId,
               workflowId: call.workflowId,
               runId: call.runId,
               callId: `ai:${call.preview ? 'preview:' : ''}${call.id}`,
               amountMicros: call.amountMicros,
               label: call.label,
               month: monthOf(now),
            },
         ],
         skipDuplicates: true,
      })
   }
}
