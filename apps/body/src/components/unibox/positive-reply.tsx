import { Chips } from '@/components/workflows/setting-inputs'
import { readableError } from '@/lib/trpc-error'
import { ThumbsUp } from 'lucide-react'

import { SOURCE_LABELS } from '@automatedLinkedIn/contracts'

import { trpc } from '../../trpc'

// Counts the person as a positive reply of a campaign (.plan/campaign-revenue-pipeline.md). One toggle button per campaign: pressed means
// counted in its pipeline, pressing again removes it. A reply the app detected says so and can be removed the same way.
export const PositiveReply = ({ conversationId }: { conversationId: string }) => {
   const utils = trpc.useUtils()
   const info = trpc.positiveReply.forConversation.useQuery({ conversationId }, { retry: false })
   const changed = async () => {
      await Promise.all([info.refetch(), utils.positiveReply.pipeline.invalidate()])
   }
   const mark = trpc.positiveReply.mark.useMutation({ onSuccess: changed })
   const unmark = trpc.positiveReply.unmark.useMutation({ onSuccess: changed })

   // A conversation that is not one person's (a group), or one the server does not know (the sample inbox), shows nothing.
   if (!info.data?.canMark) {
      return null
   }

   const { campaigns, replies, suggestedCampaignId } = info.data
   const counted = new Map(replies.filter(({ state }) => state === 'COUNTED').map(each => [each.campaignId, each]))
   const failure = mark.error ?? unmark.error

   return (
      <section className="space-y-2">
         <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
            <ThumbsUp aria-hidden className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Positive reply
         </h3>
         {campaigns.length === 0 ? (
            <p className="text-xs text-muted-foreground">Make a campaign to count a positive reply in its pipeline.</p>
         ) : (
            <>
               <p className="text-xs text-muted-foreground">Count this person in the pipeline of:</p>
               <Chips
                  id="positive-reply"
                  options={[...campaigns]
                     .sort((a, b) => Number(b.id === suggestedCampaignId) - Number(a.id === suggestedCampaignId))
                     .map(({ id, name }) => ({
                        value: id,
                        label: id === suggestedCampaignId ? `${name} (suggested)` : name,
                     }))}
                  isOn={campaignId => counted.has(campaignId)}
                  onToggle={campaignId =>
                     (counted.has(campaignId) ? unmark : mark).mutate({
                        conversationId,
                        campaignId,
                     })
                  }
               />
               {[...counted].map(([campaignId, reply]) => (
                  <p key={campaignId} className="text-xs text-muted-foreground">
                     {`${campaigns.find(({ id }) => id === campaignId)?.name ?? 'A campaign'}: ${SOURCE_LABELS[reply.source]}`}
                  </p>
               ))}
            </>
         )}
         {failure ? (
            <p className="text-xs text-destructive" role="alert">
               {readableError(failure)}
            </p>
         ) : null}
      </section>
   )
}
