import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertCircle, CheckCircle2, Clock, type LucideIcon, PauseCircle, ShieldAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type AccountStatus } from './types'

const statuses: Record<AccountStatus, { label: string; icon: LucideIcon; className: string }> = {
   PENDING: {
      label: 'Pending',
      icon: Clock,
      className: 'border-border text-muted-foreground',
   },
   ACTIVE: {
      label: 'Active',
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
   },
   NEEDS_REAUTH: {
      label: 'Needs re-auth',
      icon: ShieldAlert,
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
   },
   ERROR: {
      label: 'Error',
      icon: AlertCircle,
      className: 'bg-destructive/10 text-destructive',
   },
   DISABLED: {
      label: 'Paused',
      icon: PauseCircle,
      className: 'bg-muted text-muted-foreground',
   },
}

export const StatusBadge = ({ status, message }: { status: AccountStatus; message: string | null }) => {
   const { label, icon: Icon, className } = statuses[status]

   const badge = (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon />
         {label}
      </Badge>
   )

   if (!message) return badge

   return (
      <Tooltip>
         <TooltipTrigger asChild>{badge}</TooltipTrigger>
         <TooltipContent>{message}</TooltipContent>
      </Tooltip>
   )
}
