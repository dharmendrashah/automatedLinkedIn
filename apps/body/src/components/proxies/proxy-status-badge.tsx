import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, CheckCircle2, Clock, type LucideIcon, WifiOff } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ProxyStatus } from './types'

const statuses: Record<ProxyStatus, { label: string; icon: LucideIcon; className: string }> = {
   PENDING: {
      label: 'Pending',
      icon: Clock,
      className: 'border-border text-muted-foreground',
   },
   ACTIVE: {
      label: 'Active',
      icon: CheckCircle2,
      className: 'bg-success/10 text-success',
   },
   GEO_MISMATCH: {
      label: 'Different country',
      icon: AlertTriangle,
      className: 'bg-warning/10 text-warning',
   },
   UNREACHABLE: {
      label: 'Unreachable',
      icon: WifiOff,
      className: 'bg-destructive/10 text-destructive',
   },
   DISABLED: {
      label: 'Paused',
      icon: Clock,
      className: 'bg-muted text-muted-foreground',
   },
}

export const ProxyStatusBadge = ({ status, message }: { status: ProxyStatus; message: string | null }) => {
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
