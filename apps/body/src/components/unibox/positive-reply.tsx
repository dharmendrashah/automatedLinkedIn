import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Chips } from '@/components/workflows/setting-inputs'
import { readableError } from '@/lib/trpc-error'
import { ThumbsUp } from 'lucide-react'

import { SOURCE_LABELS } from '@automatedLinkedIn/contracts'

import { trpc } from '../../trpc'
import { type PositiveState, usePositiveReply } from './use-positive-reply'

// The campaigns to count a lead in, as buttons that stay pressed while counted, and one for a lead of no campaign yet.
const NONE = 'none'

const Choices = ({ positive, id }: { positive: PositiveState; id: string }) => {
   const { campaigns, counted, suggestedCampaignId } = positive

   return (
      <Chips
         id={id}
         options={[
            ...[...campaigns]
               .sort((a, b) => Number(b.id === suggestedCampaignId) - Number(a.id === suggestedCampaignId))
               .map(({ id: value, name }) => ({
                  value,
                  label: value === suggestedCampaignId ? `${name} (suggested)` : name,
               })),
            {
               value: NONE,
               label: 'No campaign yet',
            },
         ]}
         isOn={value => counted.has(value === NONE ? null : value)}
         onToggle={value => {
            const campaignId = value === NONE ? null : value

            void positive.set(campaignId, !counted.has(campaignId))
         }}
      />
   )
}

const sourceLine = (positive: PositiveState) =>
   positive.replies
      .map(
         ({ campaignId, source }) =>
            `${positive.campaigns.find(({ id }) => id === campaignId)?.name ?? 'No campaign yet'}: ${SOURCE_LABELS[source]}`
      )
      .join('. ')

// The Positive button in the conversation header (.plan/unibox-mark-positive-button.md): one press counts the lead in the suggested or
// only campaign, or removes it; when the choice is not clear it opens the campaigns as buttons.
export const PositiveButton = ({ positive }: { positive: PositiveState }) => {
   if (!positive.canMark) {
      return null
   }

   const counted = positive.counted.size > 0

   return (
      <Popover open={positive.choosing} onOpenChange={positive.setChoosing}>
         <PopoverAnchor asChild>
            <Button
               variant={counted ? 'secondary' : 'outline'}
               size="sm"
               onClick={positive.press}
               disabled={positive.pending}
               aria-pressed={counted}
               title="Count this lead as a positive reply in the pipeline (P)"
            >
               <ThumbsUp className={counted ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
               Positive
            </Button>
         </PopoverAnchor>
         <PopoverContent align="end" className="w-80 space-y-2">
            <p className="text-sm font-medium">Count this lead as a positive reply in:</p>
            <Choices positive={positive} id="positive-popover" />
         </PopoverContent>
      </Popover>
   )
}

// Shown next to the status when the lead is counted, with where each count came from on hover.
export const PositiveChip = ({ positive }: { positive: PositiveState }) => {
   if (!positive.canMark || positive.counted.size === 0) {
      return null
   }

   const names = [...positive.counted].map(
      campaignId => positive.campaigns.find(({ id }) => id === campaignId)?.name ?? 'no campaign yet'
   )

   return (
      <span
         title={sourceLine(positive)}
         className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 text-xs leading-5 text-emerald-700 dark:text-emerald-400"
      >
         <ThumbsUp aria-hidden className="size-3" />
         Positive: {names.join(', ')}
      </span>
   )
}

// The same choice in the Details panel, with where each count came from.
export const PositiveReply = ({ conversationId }: { conversationId: string }) => {
   const positive = usePositiveReply(conversationId)

   // A conversation that is not one person's (a group), or one the server does not know (the sample inbox), shows nothing.
   if (!positive.canMark) {
      return null
   }

   return (
      <section className="space-y-2">
         <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
            <ThumbsUp aria-hidden className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Positive reply
         </h3>
         <p className="text-xs text-muted-foreground">Count this person in the pipeline of:</p>
         <Choices positive={positive} id="positive-reply" />
         {positive.replies.length > 0 ? <p className="text-xs text-muted-foreground">{sourceLine(positive)}</p> : null}
         {positive.error ? (
            <p className="text-xs text-destructive" role="alert">
               {readableError(positive.error)}
            </p>
         ) : null}
      </section>
   )
}

// A small green thumbs-up on a row of the list when the person is counted as a positive lead. One cached list serves every row.
export const PositiveMark = ({ slug }: { slug: string }) => {
   const leads = trpc.positiveReply.leads.useQuery(undefined, {
      retry: false,
      staleTime: 60_000,
   })

   return leads.data?.includes(slug) ? (
      <ThumbsUp aria-label="Positive lead" className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
   ) : null
}
