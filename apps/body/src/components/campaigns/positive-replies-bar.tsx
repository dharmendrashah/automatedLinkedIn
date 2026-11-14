import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { CircleDollarSign, Loader2, ScanSearch, Sparkles } from 'lucide-react'

import { trpc } from '../../trpc'
import { backfillText, formatPipelineUsd } from './pipeline-format'

// Above the Campaigns list (.plan/campaign-revenue-pipeline.md): the pipeline of every campaign added up, the one-time read of existing
// messages, and the switch for the AI that reads unclear replies.
export const PositiveRepliesBar = ({ totalUsd }: { totalUsd: number | null }) => {
   const utils = trpc.useUtils()
   const aiReads = trpc.positiveReply.aiReads.useQuery(undefined, { retry: false })
   const setAi = trpc.positiveReply.setAiReads.useMutation({
      onSuccess: () => utils.positiveReply.aiReads.invalidate(),
   })
   const backfill = trpc.positiveReply.backfill.useMutation({
      onSuccess: () => utils.positiveReply.pipeline.invalidate(),
   })
   const on = aiReads.data ?? true

   return (
      <div className="grid gap-3 rounded-lg border p-4">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
               <CircleDollarSign aria-hidden className="size-5 text-emerald-600 dark:text-emerald-400" />
               <div className="grid">
                  <span className="text-muted-foreground text-xs">Revenue pipeline, all campaigns</span>
                  <span className="text-xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                     {totalUsd === null ? 'Set a worth per reply' : formatPipelineUsd(totalUsd)}
                  </span>
               </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               <Button
                  variant={on ? 'secondary' : 'outline'}
                  size="sm"
                  aria-pressed={on}
                  disabled={setAi.isPending}
                  onClick={() => setAi.mutate({ on: !on })}
               >
                  <Sparkles aria-hidden />
                  {on ? 'AI reads unclear replies: on' : 'AI reads unclear replies: off'}
               </Button>
               <Button variant="outline" size="sm" disabled={backfill.isPending} onClick={() => backfill.mutate()}>
                  {backfill.isPending ? <Loader2 className="animate-spin" /> : <ScanSearch aria-hidden />}
                  Count positive replies from my existing messages
               </Button>
            </div>
         </div>
         {backfill.data ? <p className="text-muted-foreground text-sm">{backfillText(backfill.data)}</p> : null}
         {backfill.error ? (
            <p className="text-destructive text-sm" role="alert">
               {readableError(backfill.error)}
            </p>
         ) : null}
      </div>
   )
}
