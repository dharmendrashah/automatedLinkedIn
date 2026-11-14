// Which campaign a positive reply belongs to (.plan/campaign-revenue-pipeline.md), without a database: the campaign of the person's
// newest invite; with no invite, the only campaign whose label they carry; otherwise none, and the owner picks by hand.
export const campaignOfReply = ({
   inviteCampaignId,
   labelCampaignIds,
}: {
   inviteCampaignId: string | null
   labelCampaignIds: string[]
}) => {
   if (inviteCampaignId) {
      return inviteCampaignId
   }

   const ids = [...new Set(labelCampaignIds)]

   return ids.length === 1 ? (ids[0] ?? null) : null
}

// The slug of the first person in a conversation's profile link, or null when it has none.
export const slugOfProfileUrl = (url: string | null | undefined) => /\/in\/([^/?#\s]+)/.exec(url ?? '')?.[1] ?? null
