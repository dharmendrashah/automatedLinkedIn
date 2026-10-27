import {
   CheckCircle2,
   CircleHelp,
   CircleMinus,
   Clock,
   Loader2,
   type LucideIcon,
   PauseCircle,
   RefreshCw,
   XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { type StateKind } from './today'

const ICONS: Record<StateKind, LucideIcon> = {
   DONE: CheckCircle2,
   COUNTED: CheckCircle2,
   RUNNING: Loader2,
   WAITING: Clock,
   FAILED: XCircle,
   UNSURE: CircleHelp,
   PENDING: Clock,
   LATER: Clock,
   ON_SCHEDULE: RefreshCw,
   LATE: RefreshCw,
   PAUSED: PauseCircle,
   SIGN_IN: CircleMinus,
   NO_ANSWER: CircleHelp,
}

export const StateIcon = ({ kind, className }: { kind: StateKind; className?: string }) => {
   const Icon = ICONS[kind]

   return <Icon className={cn('size-3.5', kind === 'RUNNING' && 'animate-spin', className)} aria-hidden />
}
