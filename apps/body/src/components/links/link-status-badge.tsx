import { Badge } from '@/components/ui/badge'
import { type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type LinkStatus } from './types'

import { linkStatuses } from './link-statuses'

export type StatusStyle = {
   label: string
   icon: LucideIcon
   className: string
}

export const StatusBadge = ({ label, icon: Icon, className }: StatusStyle) => (
   <Badge variant="outline" className={cn('gap-1', className)}>
      <Icon />
      {label}
   </Badge>
)

export const LinkStatusBadge = ({ status }: { status: LinkStatus }) => <StatusBadge {...linkStatuses[status]} />
