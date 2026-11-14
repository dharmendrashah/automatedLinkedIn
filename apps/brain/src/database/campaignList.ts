import {
   type CampaignCounts,
   type CampaignListNumbers,
   type CampaignListRow,
   type CampaignTrendDay,
   campaignListStateOf,
   rateOf,
} from '@automatedLinkedIn/contracts'

import {
   cutoffOf,
   dayKeyOf,
   gateOf,
   gatePasses,
   paceOf,
   projectionOf,
   shareOf,
   sinceOf,
   totalsOf,
   trendDays,
   windowDays,
} from './campaignTrend'

// The Campaigns list row, built from the same rules as the campaign page (campaignTrend.ts). Read only.

export type ListCampaign = {
   id: string
   name: string
   workflows: number
   pausedAt: Date | null
   createdAt: Date
}

export type ListOwner = {
   capacity: { perDay: number; perWeek: number; usableAccounts: number }
   runningCampaigns: number
   walletLow: boolean
}

export type ListRowInput = {
   campaign: ListCampaign
   owner: ListOwner
   now: Date
   firstRowDay: string | null
   rows: Map<string, CampaignCounts>
}

// Replies are summed per counted day (each person is counted on the day of their last reply).
const numbersOf = (entries: CampaignTrendDay[]): CampaignListNumbers => {
   const totals = totalsOf(entries, false)
   const replied = entries.reduce((sum, entry) => sum + (entry.state === 'counted' ? entry.counts.replied : 0), 0)

   return {
      qualified: totals.qualified,
      invited: totals.invited,
      acceptRate: rateOf(totals.accepted, totals.invited),
      replied,
   }
}

export const listRowOf = ({ campaign, owner, now, firstRowDay, rows }: ListRowInput): CampaignListRow => {
   const creationDay = dayKeyOf(campaign.createdAt)
   const since = sinceOf(creationDay, firstRowDay)
   const entries = trendDays(windowDays(now), {
      creationDay,
      since,
      cutoff: cutoffOf(now),
      rows,
   })
   const gate = gateOf(entries)
   const state = campaignListStateOf({
      workflows: campaign.workflows,
      paused: campaign.pausedAt !== null,
      since,
   })
   const base = {
      id: campaign.id,
      name: campaign.name,
      workflows: campaign.workflows,
      pausedAt: campaign.pausedAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      state,
      gate,
   }

   if (state === 'NO_WORKFLOWS')
      return {
         ...base,
         numbers: null,
         projection: null,
      }

   const numbers = since === null ? null : numbersOf(entries)
   const { share, denominator } = shareOf(owner.capacity, owner.runningCampaigns, campaign.pausedAt !== null)
   const projection = projectionOf({
      gatePassed: gatePasses(gate),
      usableAccounts: owner.capacity.usableAccounts,
      paused: campaign.pausedAt !== null,
      walletLow: owner.walletLow,
      capacity: owner.capacity,
      share,
      shareDenominator: denominator,
      ...paceOf(entries),
   })

   return {
      ...base,
      numbers,
      projection,
   }
}
