import { PrismaService } from './prisma.service'

// A switch the operator holds for the whole platform (.plan/lead-pipeline-p3-engage.md, P8). `acts` stops every reaction and comment at
// the next pick-up; it is on by default.
const ACTS = 'acts'

type Switch = { on: boolean }

const readSwitch = (value: unknown): boolean => (value as Partial<Switch> | null)?.on !== false

export class PlatformSettingService {
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
