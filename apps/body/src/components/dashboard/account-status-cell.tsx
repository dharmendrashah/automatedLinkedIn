import { Badge } from '@/components/ui/badge'
import { Clock } from 'lucide-react'

import type { DashboardOverview } from '@automatedLinkedIn/contracts'

import { cn } from '@/lib/utils'

import { accountStatuses } from '../accounts/account-statuses'
import { restingText } from './format'

// The status of an account: its own word, or for an active account that is resting, until when.
export const AccountStatusCell = ({ row, now }: { row: DashboardOverview['accounts'][number]; now: Date }) => {
   if (row.status === 'ACTIVE' && row.rest !== 'none') {
      return (
         <Badge variant="outline" className="gap-1 bg-warning/10 text-warning">
            <Clock />
            {restingText(row.rest, row.until, now)}
         </Badge>
      )
   }

   const { label, icon: Icon, className } = accountStatuses[row.status]

   return (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon />
         {label}
      </Badge>
   )
}
