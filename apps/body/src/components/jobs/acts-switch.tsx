import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { trpc } from '../../trpc'
import { ToneBadge } from './tone-badge'

type Row = {
   title: string
   on: boolean
   onWords: string
   offWords: string
   changedBy?: string | null
   changedAt?: string | Date | null
   pending: boolean
   error?: string
   onToggle: () => void
}

const SwitchRow = ({ title, on, onWords, offWords, changedBy, changedAt, pending, error, onToggle }: Row) => (
   <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <div className="grid gap-1">
         <div className="flex items-center gap-2 text-sm font-medium">
            {title}
            <ToneBadge tone={on ? 'success' : 'warning'}>{on ? 'On' : 'Paused'}</ToneBadge>
         </div>
         <p className="text-muted-foreground text-xs">
            {on ? onWords : offWords}
            {changedBy && changedAt ? ` Last changed by ${changedBy} on ${new Date(changedAt).toLocaleString()}.` : ''}
         </p>
      </div>
      <Button variant={on ? 'outline' : 'default'} size="sm" disabled={pending} onClick={onToggle}>
         {on ? 'Pause all' : 'Resume'}
      </Button>
      {error ? <p className="text-destructive w-full text-sm">{error}</p> : null}
   </div>
)

// The one switch that stops every reaction and comment the platform makes, at the next pick-up (.plan/lead-pipeline-p3-engage.md, P8).
export const ActsSwitch = () => {
   const utils = trpc.useUtils()
   const acts = trpc.jobs.acts.useQuery(undefined, { retry: false })
   const change = trpc.jobs.setActs.useMutation({ onSuccess: () => utils.jobs.acts.invalidate() })

   if (acts.isPending) {
      return <Skeleton className="h-16 w-full rounded-xl" />
   }

   if (!acts.data) {
      return <p className="text-destructive text-sm">{acts.error?.message}</p>
   }

   const { on, changedBy, changedAt } = acts.data

   return (
      <SwitchRow
         title="Reactions and comments"
         on={on}
         onWords="Accounts react to and comment on posts inside their limits."
         offWords="Nothing is planned or sent. What is waiting stays queued."
         changedBy={changedBy}
         changedAt={changedAt}
         pending={change.isPending}
         error={change.error?.message}
         onToggle={() => change.mutate({ on: !on })}
      />
   )
}

// The switch of With AI (.plan/lead-pipeline-p4-ai-drafts.md): off, Write words with AI leaves every post to Else; texts go on.
export const AiSwitch = () => {
   const utils = trpc.useUtils()
   const ai = trpc.jobs.ai.useQuery(undefined, { retry: false })
   const change = trpc.jobs.setAi.useMutation({ onSuccess: () => utils.jobs.ai.invalidate() })

   if (ai.isPending) {
      return <Skeleton className="h-16 w-full rounded-xl" />
   }

   if (!ai.data) {
      return <p className="text-destructive text-sm">{ai.error?.message}</p>
   }

   const { on } = ai.data

   return (
      <SwitchRow
         title="With AI"
         on={on}
         onWords="Write words can ask the AI, inside the caps of each owner and of the platform."
         offWords="Write words with AI leaves every post to Else. Texts and every other block go on."
         pending={change.isPending}
         error={change.error?.message}
         onToggle={() => change.mutate({ on: !on })}
      />
   )
}
