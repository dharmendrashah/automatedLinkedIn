import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { timeAgo } from '@/lib/time-ago'
import {
   BellOff,
   CircleCheck,
   CirclePause,
   CircleStop,
   CircleX,
   Clock,
   Flame,
   Hand,
   Handshake,
   Loader2,
   type LucideIcon,
   Megaphone,
   MessageSquare,
   Search,
   Shapes,
   TriangleAlert,
   UserPlus,
} from 'lucide-react'
import { Link } from 'react-router'

import { CAMPAIGN_STAGES, type CampaignStage, STAGE_LABELS } from '@automatedLinkedIn/contracts'

import { cn } from '@/lib/utils'

import { type WorkflowSummary, formatUsd, runStatuses, whenText } from './types'

import { isLive, runSentence } from './run-sentence'
import { metricsOf, scheduleOf } from './workflow-row'

type LastRun = WorkflowSummary['runs'][number]

const Dash = () => <span className="text-muted-foreground">–</span>

// A column heading with an icon and, on hover or focus, what the column counts.
export const Heading = ({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint: string }) => (
   <Tooltip>
      <TooltipTrigger asChild>
         <button type="button" className="inline-flex items-center gap-1.5 outline-none focus-visible:underline">
            <Icon aria-hidden className="size-4" />
            {label}
         </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
   </Tooltip>
)

const STAGE_ICONS: Record<CampaignStage, LucideIcon> = {
   DISCOVER: Search,
   INVITE: UserPlus,
   WARM_UP: Flame,
   FIRST_MESSAGE: MessageSquare,
   HAND_OFF: Handshake,
   NO_ANSWER: BellOff,
   OTHER: Shapes,
}

// The campaign the workflow belongs to and its place in it, "3 Warm up".
export const CampaignCell = ({ workflow }: { workflow: WorkflowSummary }) => {
   if (!workflow.campaignId || !workflow.campaign) {
      return <span className="text-muted-foreground text-sm">No campaign</span>
   }

   const StageIcon = STAGE_ICONS[workflow.stage]
   const at = CAMPAIGN_STAGES.indexOf(workflow.stage) + 1

   return (
      <div className="flex items-center gap-2">
         <Megaphone aria-hidden className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
         <div className="grid min-w-0 gap-0.5">
            <Link
               to={`/campaigns/${workflow.campaignId}`}
               title={workflow.campaign.name}
               className="max-w-56 truncate font-medium underline-offset-4 hover:underline"
            >
               {workflow.campaign.name}
            </Link>
            {workflow.stage === 'OTHER' ? null : (
               <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <StageIcon aria-hidden className="size-3.5" />
                  {`${at} ${STAGE_LABELS[workflow.stage]}`}
               </span>
            )}
         </div>
      </div>
   )
}

const SCHEDULES = {
   on: { label: 'On', icon: Clock, className: 'text-emerald-600 dark:text-emerald-400' },
   off: { label: 'Off', icon: CirclePause, className: 'text-amber-600 dark:text-amber-400' },
   manual: { label: 'By hand', icon: Hand, className: 'text-muted-foreground' },
} as const

export const ScheduleCell = ({ workflow }: { workflow: WorkflowSummary }) => {
   const state = scheduleOf(workflow)
   const { label, icon: Icon, className } = SCHEDULES[state]
   const next = state === 'on' ? whenText(workflow.nextRunAt ?? null) : null

   return (
      <div className="grid gap-0.5">
         <span className={cn('inline-flex items-center gap-1.5 font-medium', className)}>
            <Icon aria-hidden className="size-4" />
            {label}
         </span>
         {next ? <span className="text-muted-foreground text-xs">{`Next ${next}`}</span> : null}
      </div>
   )
}

const RUN_ICONS: Record<LastRun['status'], LucideIcon> = {
   QUEUED: Clock,
   RUNNING: Loader2,
   SUCCEEDED: CircleCheck,
   PARTIAL: TriangleAlert,
   FAILED: CircleX,
   STOPPED: CircleStop,
}

// How the last run ended, when it started, and for a failed or partial run the reason.
export const LastRunCell = ({ run }: { run: LastRun | undefined }) => {
   if (!run) {
      return <span className="text-muted-foreground text-sm">Never run</span>
   }

   const Icon = RUN_ICONS[run.status]
   const label = run.status === 'RUNNING' && run.stopRequestedAt ? 'Stopping' : runStatuses[run.status].label
   const reason =
      run.status === 'FAILED' || run.status === 'PARTIAL' ? runSentence({ ...run, steps: [] }, type => type) : null

   return (
      <div className="grid gap-1">
         <span
            className={cn(
               'inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
               runStatuses[run.status].className
            )}
         >
            <Icon
               aria-hidden
               className={cn('size-3.5', isLive(run.status) && run.status === 'RUNNING' && 'animate-spin')}
            />
            {label}
         </span>
         <span className="text-muted-foreground text-xs" title={new Date(run.startedAt).toLocaleString()}>
            {`Started ${timeAgo(run.startedAt)}`}
         </span>
         {reason ? (
            <span className="text-muted-foreground line-clamp-2 max-w-72 text-xs" title={reason}>
               {reason}
            </span>
         ) : null}
      </div>
   )
}

// A count of people; a dash when there is none to show.
export const CountCell = ({ value, tone }: { value: number | null; tone?: 'good' }) =>
   value === null ? (
      <Dash />
   ) : (
      <span
         className={cn(
            'tabular-nums',
            tone === 'good' && value > 0 && 'text-lg font-semibold text-emerald-600 dark:text-emerald-400'
         )}
      >
         {value}
      </span>
   )

// What the last run cost, with the cost per qualified person under it; a run that is going shows what is spent so far.
export const CostCell = ({ run }: { run: LastRun | undefined }) => {
   if (!run) {
      return <Dash />
   }

   if (run.status === 'RUNNING') {
      return (
         <span className="text-muted-foreground block text-right text-xs">
            {`about ${formatUsd(run.costMicros)} of up to ${formatUsd(run.estimateMicros)}`}
         </span>
      )
   }

   const { cost, perQualified } = metricsOf(run)

   return (
      <div className="grid justify-items-end gap-0.5">
         <span className="tabular-nums">{cost === null ? '–' : formatUsd(cost)}</span>
         {perQualified === null ? null : (
            <span className="text-muted-foreground text-xs tabular-nums">{`${formatUsd(perQualified)} per qualified`}</span>
         )}
      </div>
   )
}
