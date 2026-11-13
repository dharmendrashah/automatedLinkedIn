import { type CampaignScope, countsFor } from './campaignCounts'
import { PrismaService } from './prisma.service'

// Keeps what each campaign did in each of the last days, past the 14 days run items live (.plan/lead-pipeline-p5-campaign-page.md).
// Rewrites the last 2 days on every pass, so a late accept or an approval is counted and running it again changes nothing.

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_REWRITTEN = 2

export const dayOf = (date: Date) => date.toISOString().slice(0, 10)

export class CampaignRollupService {
   public static async run(now = new Date()) {
      const db = PrismaService.client
      const campaigns = await db.campaign.findMany({
         select: {
            id: true,
            userId: true,
            label: true,
            workflows: { select: { id: true } },
         },
      })
      let written = 0

      for (const campaign of campaigns) {
         const scope: CampaignScope = {
            userId: campaign.userId,
            label: campaign.label,
            workflowIds: campaign.workflows.map(({ id }) => id),
         }

         for (let back = 0; back < DAYS_REWRITTEN; back += 1) {
            const day = new Date(now.getTime() - back * DAY_MS)
            const from = new Date(`${dayOf(day)}T00:00:00.000Z`)
            const counts = await countsFor(scope, from, new Date(from.getTime() + DAY_MS))

            await db.campaignDay.upsert({
               where: {
                  campaignId_day: {
                     campaignId: campaign.id,
                     day: dayOf(day),
                  },
               },
               create: {
                  campaignId: campaign.id,
                  day: dayOf(day),
                  ...counts,
               },
               update: counts,
            })
            written += 1
         }
      }

      return {
         campaigns: campaigns.length,
         written,
      }
   }
}
