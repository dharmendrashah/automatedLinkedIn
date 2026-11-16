import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { cn } from '@/lib/utils'

import { type AccountStatus } from './types'

import { accountStatuses } from './account-statuses'

export const StatusBadge = ({ status, message }: { status: AccountStatus; message: string | null }) => {
   const { label, icon: Icon, className } = accountStatuses[status]

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
