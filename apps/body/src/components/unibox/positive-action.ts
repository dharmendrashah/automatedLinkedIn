export type Pick = {
   id: string
   name: string
}

export type PositiveAction =
   { kind: 'mark'; campaignId: string | null } | { kind: 'unmark'; campaignId: string | null } | { kind: 'choose' }

// What one press of Positive does (.plan/unibox-mark-positive-button.md). `counted` holds the campaigns the person is counted in, and null
// stands for a positive lead of no campaign. Counted once: press again to remove. Counted twice or more, or an unclear campaign: ask.
export const positiveAction = ({
   campaigns,
   counted,
   suggestedCampaignId,
}: {
   campaigns: Pick[]
   counted: ReadonlySet<string | null>
   suggestedCampaignId: string | null
}): PositiveAction => {
   const [first, second] = [...counted]

   if (first !== undefined && second === undefined) {
      return {
         kind: 'unmark',
         campaignId: first,
      }
   }

   if (second !== undefined) {
      return { kind: 'choose' }
   }

   const [only, other] = campaigns
   const suggested = campaigns.find(({ id }) => id === suggestedCampaignId)

   if (suggested) {
      return {
         kind: 'mark',
         campaignId: suggested.id,
      }
   }

   if (!only) {
      return {
         kind: 'mark',
         campaignId: null,
      }
   }

   return other
      ? { kind: 'choose' }
      : {
           kind: 'mark',
           campaignId: only.id,
        }
}
