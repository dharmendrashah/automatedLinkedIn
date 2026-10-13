import { Badge } from '@/components/ui/badge'

import { cn } from '@/lib/utils'

import { type LinkStatus } from './types'

import { linkStatuses } from './link-statuses'

export const LinkStatusBadge = ({ status }: { status: LinkStatus }) => {
   const { label, icon: Icon, className } = linkStatuses[status]

   return (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon />
         {label}
      </Badge>
   )
}
