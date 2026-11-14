import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { readableError } from '@/lib/trpc-error'
import { CircleDollarSign, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { formatPipelineUsd, formulaText, parseWorth, sourceLine } from './pipeline-format'

// The revenue pipeline of one campaign (.plan/campaign-revenue-pipeline.md): the positive replies it brought times what one is worth a
// month times 12, with the sum written out and the worth set in place.
export const PipelineCard = ({ campaignId }: { campaignId: string }) => {
   const utils = trpc.useUtils()
   const pipeline = trpc.positiveReply.pipeline.useQuery(undefined, { retry: false })
   const row = pipeline.data?.campaigns.find(({ id }) => id === campaignId)
   const [draft, setDraft] = useState<string | null>(null)
   const save = trpc.positiveReply.setValue.useMutation({
      onSuccess: async () => {
         setDraft(null)
         await utils.positiveReply.pipeline.invalidate()
      },
   })

   if (!row) {
      return null
   }

   const shown = draft ?? (row.replyValueUsd === null ? '' : String(row.replyValueUsd))
   const parsed = parseWorth(shown)
   const unchanged = parsed === row.replyValueUsd
   const submit = () => {
      if (parsed !== 'invalid' && !unchanged) {
         save.mutate({
            id: campaignId,
            valueUsd: parsed,
         })
      }
   }
   const split = sourceLine(row)

   return (
      <Card>
         <CardContent className="grid gap-3">
            <CardDescription className="flex items-center gap-2">
               <CircleDollarSign aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
               Revenue pipeline
            </CardDescription>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
               {row.pipelineUsd === null ? (
                  <span className="text-muted-foreground text-lg">Set what a positive reply is worth</span>
               ) : (
                  <span className="text-3xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                     {formatPipelineUsd(row.pipelineUsd)}
                  </span>
               )}
               <span className="text-muted-foreground text-sm">
                  {row.pipelineUsd !== null && row.replyValueUsd !== null
                     ? `${formulaText(row.replies, row.replyValueUsd)}. An estimate for a year.`
                     : `${row.replies} positive ${row.replies === 1 ? 'reply' : 'replies'} so far.`}
               </span>
            </div>
            {split ? <p className="text-muted-foreground text-xs">{split}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
               <label htmlFor="reply-value" className="text-sm">
                  Each positive reply is worth $
               </label>
               <Input
                  id="reply-value"
                  inputMode="numeric"
                  className="w-28"
                  placeholder="100"
                  value={shown}
                  aria-invalid={parsed === 'invalid'}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                     if (event.key === 'Enter') {
                        submit()
                     }
                  }}
               />
               <span className="text-sm">a month</span>
               <Button
                  size="sm"
                  variant="outline"
                  disabled={parsed === 'invalid' || unchanged || save.isPending}
                  onClick={submit}
               >
                  {save.isPending ? <Loader2 className="animate-spin" /> : null}
                  Save
               </Button>
            </div>
            {parsed === 'invalid' ? (
               <p className="text-destructive text-xs" role="alert">
                  Write a whole number of dollars a month, such as 100.
               </p>
            ) : null}
            {save.error ? (
               <p className="text-destructive text-xs" role="alert">
                  {readableError(save.error)}
               </p>
            ) : null}
         </CardContent>
      </Card>
   )
}
