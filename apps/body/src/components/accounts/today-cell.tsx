import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { cn } from '@/lib/utils'

import { type AccountBrowse } from '../browsing/types'

import { meterText } from '../browsing/format'
import { limitSecondsOf } from '../browsing/modes'
import { StateIcon } from './state-chip'
import { ITEMS, type ItemState, briefText, overallTone, progressText } from './today'
import { TONE_CLASS, TONE_TEXT } from './tone-class'

type Props = {
   states: ItemState[] | undefined
   browse: AccountBrowse | undefined
   // The full chips with times, instead of four small icons and one line.
   detailed: boolean
   loading: boolean
   onOpen: () => void
}

const titleOf = (item: ItemState['item']) => ITEMS.find(entry => entry.item === item)?.title ?? item

// The budget stays visible under the checklist, as one muted figure.
const budgetText = (browse: AccountBrowse | undefined) =>
   browse && browse.state !== 'NOT_BROWSING'
      ? `${meterText(browse.usedSeconds, limitSecondsOf(browse.mode))} today`
      : null

const Tip = ({ state, children }: { state: ItemState; children: React.ReactNode }) => (
   <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
         <p className="font-medium">
            {titleOf(state.item)}: {state.text}
         </p>
         <p>{state.detail}</p>
         <p>Next: {state.next}</p>
      </TooltipContent>
   </Tooltip>
)

// What the account did today, in four chips (Login, Visit, Messages, Network). Compact: four small icons and one line, which leads
// with a failure. Detailed: the full chips with their times. Any chip opens the account's drawer on the checklist.
export const TodayCell = ({ states, browse, detailed, loading, onOpen }: Props) => {
   if (!states) {
      return loading ? <Skeleton className="h-6 w-32" /> : <span className="text-muted-foreground text-sm">—</span>
   }

   const messages = states.find(({ item }) => item === 'messages')
   const budget = budgetText(browse)

   return (
      <div className="grid gap-1.5">
         {detailed ? (
            <div className="grid max-w-80 grid-cols-2 gap-1">
               {states.map(state => (
                  <Tip key={state.item} state={state}>
                     <button
                        type="button"
                        className={cn(
                           'focus-visible:ring-ring/50 flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-left text-xs outline-none focus-visible:ring-[3px]',
                           TONE_CLASS[state.tone]
                        )}
                        onClick={onOpen}
                     >
                        <StateIcon kind={state.kind} className="shrink-0" />
                        <span className="truncate">{state.text}</span>
                     </button>
                  </Tip>
               ))}
            </div>
         ) : (
            <div className="flex items-center gap-2">
               <span className="flex gap-1">
                  {states.map(state => (
                     <Tip key={state.item} state={state}>
                        <button
                           type="button"
                           aria-label={`${titleOf(state.item)}: ${state.text}`}
                           className={cn(
                              'focus-visible:ring-ring/50 flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]',
                              TONE_CLASS[state.tone]
                           )}
                           onClick={onOpen}
                        >
                           <StateIcon kind={state.kind} />
                        </button>
                     </Tip>
                  ))}
               </span>
               <span className={cn('text-sm', TONE_TEXT[overallTone(states)])}>{briefText(states)}</span>
            </div>
         )}
         <span className="text-muted-foreground text-xs">
            {[detailed ? progressText(states) : messages?.text, budget].filter(Boolean).join(' · ')}
         </span>
      </div>
   )
}
