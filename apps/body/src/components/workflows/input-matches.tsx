import { CircleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

import { trpc } from '../../trpc'
import { INPUT_CAPS, INPUT_KINDS, type InputType } from './input-kinds'
import { timeOf } from './run-sentence'
import { type ConfigValue } from './types'

const SINGULAR: Record<InputType, string> = {
   'input.posts': 'post',
   'input.profiles': 'profile',
   'input.companies': 'company',
}

// What the input block would take right now, so an empty or too narrow slice shows before a run.
export const InputMatches = ({
   workflowId,
   type,
   values,
}: {
   workflowId: string
   type: InputType
   values: Record<string, ConfigValue | undefined>
}) => {
   const config = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
   const matches = trpc.workflow.inputMatches.useQuery(
      {
         workflowId,
         type,
         config,
      },
      { placeholderData: previous => previous }
   )
   const noun = INPUT_KINDS[type]

   if (Array.isArray(values.links) && values.links.length > 0) {
      return <p className="text-muted-foreground text-sm">Takes the {values.links.length} links you gave, as they are.</p>
   }

   if (!matches.data) {
      return null
   }

   const { count, since } = matches.data
   const all = values.all === true
   const takes = all ? INPUT_CAPS[type] : Number(values.howMany ?? 0)
   const one = count === 1
   const lastRun =
      values.added === 'lastRun'
         ? since
            ? `added since the last run (${timeOf(since)})`
            : 'no run finished yet, so the first one takes all that match'
         : null
   const parts = [
      `${count} ${one ? SINGULAR[type] : noun}${type === 'input.posts' ? ' waiting' : ''} ${one ? 'matches' : 'match'} now`,
      lastRun,
      count > takes ? `this block takes the first ${takes}` : all ? 'this block takes them all' : null,
   ].filter(Boolean)

   return (
      <p
         className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
            count === 0 ? 'border-warning/40 bg-warning/10 text-warning' : 'bg-muted/40'
         )}
         role="status"
      >
         {count === 0 ? <CircleAlert className="size-4 shrink-0" aria-hidden /> : null}
         {count === 0 ? `Nothing matches right now, so a run takes no ${noun}.` : `${parts.join(' · ')}.`}
      </p>
   )
}
