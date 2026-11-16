import { AlertCircle, Ban, CheckCircle2, Clock, type LucideIcon, PauseCircle, ShieldAlert } from 'lucide-react'

import { type AccountStatus } from './types'

export const accountStatuses: Record<AccountStatus, { label: string; icon: LucideIcon; className: string }> = {
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
   NEEDS_REAUTH: {
      label: 'Needs re-auth',
      icon: ShieldAlert,
      className: 'bg-warning/10 text-warning',
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
   BLOCKED: {
      label: 'Blocked',
      icon: Ban,
      className: 'bg-destructive/10 text-destructive',
   },
}
