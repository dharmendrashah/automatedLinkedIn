import { z } from 'zod'

import { PrismaService } from './prisma.service'

// A switch the operator holds for the whole platform (.plan/lead-pipeline-p3-engage.md, P8). `acts` stops every reaction and comment at
// the next pick-up; it is on by default.
const ACTS = 'acts'
const AI = 'ai'

type Switch = { on: boolean }

const readSwitch = (value: unknown): boolean => (value as Partial<Switch> | null)?.on !== false

// The switch `ai` stops With AI for everyone, and the caps are in millionths of a dollar (.plan/lead-pipeline-p4-ai-drafts.md).
const aiSchema = z.object({
   on: z.boolean().default(true),
   ownerDayMicros: z.number().int().min(0).default(2_000_000),
   ownerMonthMicros: z.number().int().min(0).default(5_000_000),
   platformDayMicros: z.number().int().min(0).default(5_000_000),
   platformMonthMicros: z.number().int().min(0).default(50_000_000),
})

export type AiSettings = z.infer<typeof aiSchema>

export class PlatformSettingService {
   // The `ai` switch and caps; what was never changed reads as the defaults.
   public static async ai(): Promise<AiSettings> {
      const row = await PrismaService.client.platformSetting.findUnique({ where: { key: AI } })

      return aiSchema.safeParse(row?.value ?? {}).data ?? aiSchema.parse({})
   }

   public static async setAi(patch: Partial<AiSettings>, changedBy: string) {
      const value = aiSchema.parse({
         ...(await this.ai()),
         ...patch,
      })

      await PrismaService.client.platformSetting.upsert({
         where: { key: AI },
         create: {
            key: AI,
            value,
            changedBy,
         },
         update: {
            value,
            changedBy,
         },
      })

      return value
   }

   public static async actsOn() {
      const row = await PrismaService.client.platformSetting.findUnique({ where: { key: ACTS } })

      return row ? readSwitch(row.value) : true
   }

   // The switch with who changed it and when; a switch never changed reads as on.
   public static async actsSwitch() {
      const row = await PrismaService.client.platformSetting.findUnique({ where: { key: ACTS } })

      return {
         on: row ? readSwitch(row.value) : true,
         changedBy: row?.changedBy ?? null,
         changedAt: row?.updatedAt ?? null,
      }
   }

   public static async setActs(on: boolean, changedBy: string) {
      await PrismaService.client.platformSetting.upsert({
         where: { key: ACTS },
         create: {
            key: ACTS,
            value: { on },
            changedBy,
         },
         update: {
            value: { on },
            changedBy,
         },
      })

      return this.actsSwitch()
   }
}
