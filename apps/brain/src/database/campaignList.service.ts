import type { CampaignCounts, CampaignListRow } from '@automatedLinkedIn/contracts'

import { CampaignService } from './campaign.service'
import { listRowOf } from './campaignList'
import { windowDays } from './campaignTrend'
import { LinkedInInviteService } from './linkedInInvite.service'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'

// The Campaigns list rows (.plan/campaign-list-and-detail-icons.md). Read only; the row rule lives in campaignList.ts.
export class CampaignListService {
   public static async list(userId: string, now = new Date()): Promise<CampaignListRow[]> {
      const campaigns = await CampaignService.list(userId)
      if (campaigns.length === 0) return []

      const db = PrismaService.client
      const campaignId = { in: campaigns.map(({ id }) => id) }
      const [firstDays, windowRows, capacity, runningCampaigns, walletLow] = await Promise.all([
         db.campaignDay.groupBy({
            by: ['campaignId'],
            where: { campaignId },
            _min: { day: true },
         }),
         db.campaignDay.findMany({
            where: {
               campaignId,
               day: { gte: windowDays(now)[0] },
            },
            select: {
               campaignId: true,
               day: true,
               found: true,
               qualified: true,
               invited: true,
               accepted: true,
               messaged: true,
               replied: true,
            },
         }),
         LinkedInInviteService.usableCapacityOf(userId, now),
         db.campaign.count({
            where: {
               userId,
               pausedAt: null,
            },
         }),
         WalletService.belowFloor(),
      ])

      const firstRowDay = new Map(firstDays.map(({ campaignId: id, _min }) => [id, _min.day]))
      const rowsByCampaign = new Map<string, Map<string, CampaignCounts>>()
      for (const { campaignId: id, day, ...counts } of windowRows) {
         const days = rowsByCampaign.get(id) ?? new Map<string, CampaignCounts>()
         days.set(day, counts)
         rowsByCampaign.set(id, days)
      }

      const owner = {
         capacity,
         runningCampaigns,
         walletLow,
      }
      return campaigns.map(campaign =>
         listRowOf({
            campaign,
            owner,
            now,
            firstRowDay: firstRowDay.get(campaign.id) ?? null,
            rows: rowsByCampaign.get(campaign.id) ?? new Map(),
         })
      )
   }
}
