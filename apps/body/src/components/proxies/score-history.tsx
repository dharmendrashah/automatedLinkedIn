import { RadioMark } from '@/components/radio-mark'
import { SectionLabel, TextBlock } from '@/components/text-block'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import {
   addressLines,
   breakdownLines,
   explainReputation,
   labelFor,
   reasonLines,
   recentLines,
   reputationBadge,
   scoreClass,
} from './score'

import { cn } from '@/lib/utils'

import { type Proxy } from './types'

import { type RouterOutputs, trpc } from '../../trpc'

type ScoreEntry = RouterOutputs['proxyServer']['scoreHistory'][number]

const formatTime = (value: string | Date) =>
   new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
   })

const VerdictBadge = ({ state }: { state: ScoreEntry['reputationState'] }) => (
   <Badge variant="outline" className={reputationBadge[state].className}>
      {reputationBadge[state].label}
   </Badge>
)

// Why a score is what it is: the blacklist verdict, how the number adds up, and the reports behind the reputation.
const ScoreDetail = ({ entry }: { entry: ScoreEntry }) => (
   <div className="grid gap-4">
      <section className="grid gap-1.5">
         <SectionLabel>Blacklist</SectionLabel>
         <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge state={entry.reputationState} />
            <span className="text-muted-foreground text-xs">{entry.ip}</span>
         </div>
         <p className="text-sm">{explainReputation(entry.reputationState, entry.abuseScore)}</p>
      </section>

      <TextBlock title="How the score was made">{breakdownLines(entry).join('\n')}</TextBlock>

      {entry.detail ? (
         <>
            <TextBlock title={`Reported for (last ${entry.detail.maxAgeInDays} days)`}>
               {reasonLines(entry.detail).join('\n')}
            </TextBlock>
            {entry.detail.recent.length > 0 ? (
               <TextBlock title={`Newest reports (${entry.detail.recent.length})`}>
                  {recentLines(entry.detail).join('\n')}
               </TextBlock>
            ) : null}
            {addressLines(entry.detail).length > 0 ? (
               <TextBlock title="About the address">{addressLines(entry.detail).join('\n')}</TextBlock>
            ) : null}
         </>
      ) : entry.reputationChecked ? (
         <p className="text-muted-foreground text-sm">
            No report details were saved for this score; scores made before this view existed have none.
         </p>
      ) : null}
   </div>
)

export const ScoreHistory = ({ proxy }: { proxy: Proxy | null }) => {
   const [picked, setPicked] = useState<string | null>(null)
   const scores = trpc.proxyServer.scoreHistory.useQuery(
      { id: proxy?.id ?? '' },
      {
         enabled: Boolean(proxy),
         retry: false,
      }
   )

   if (scores.error) return <p className="text-destructive text-sm">{scores.error.message}</p>

   if (scores.isPending && proxy) return <Skeleton className="h-16 w-full rounded-xl" />

   if (!scores.data || scores.data.length === 0) {
      return (
         <p className="text-muted-foreground text-sm">
            No scores yet. A proxy is scored after each test and once a day.
         </p>
      )
   }

   // Newest first, so the latest score is the one explained until another is picked.
   const selected = scores.data.find(entry => entry.id === picked) ?? scores.data[0]

   return (
      <>
         <section className="grid gap-2">
            <SectionLabel>{`Score history (${scores.data.length}, kept for 30 days)`}</SectionLabel>
            <ul className="-mx-1 grid max-h-64 gap-2 overflow-y-auto px-1 py-1" aria-label="Scores">
               {scores.data.map(entry => {
                  const isSelected = entry.id === selected.id

                  return (
                     <li key={entry.id}>
                        <button
                           type="button"
                           onClick={() => setPicked(entry.id)}
                           aria-pressed={isSelected}
                           className={cn(
                              'bg-card hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors outline-none focus-visible:ring-[3px]',
                              isSelected && 'border-primary/60 bg-muted/60 ring-primary/20 ring-1'
                           )}
                        >
                           <div className="grid min-w-0 flex-1 gap-1.5">
                              <span className="text-sm font-medium">{formatTime(entry.scoredAt)}</span>
                              <span className="flex flex-wrap items-center gap-1.5">
                                 <VerdictBadge state={entry.reputationState} />
                                 <span className="text-muted-foreground text-xs">
                                    {entry.latencyMs === null ? '' : `${entry.latencyMs} ms`}
                                 </span>
                              </span>
                           </div>
                           <span
                              className={cn('text-sm font-semibold tabular-nums', scoreClass[labelFor(entry.score)])}
                           >
                              {entry.score}
                           </span>
                           <RadioMark checked={isSelected} />
                        </button>
                     </li>
                  )
               })}
            </ul>
         </section>

         <section className="grid gap-3">
            <div className="flex items-center justify-between">
               <SectionLabel>Score details</SectionLabel>
               {scores.isFetching ? <Loader2 className="text-muted-foreground size-4 animate-spin" /> : null}
            </div>
            <ScoreDetail entry={selected} />
         </section>
      </>
   )
}
