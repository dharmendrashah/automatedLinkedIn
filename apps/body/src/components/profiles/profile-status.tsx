import { Badge } from '@/components/ui/badge'

import { cn } from '@/lib/utils'

import { profileStatuses } from './profile-statuses'
import { type ProfileStatus } from './types'

export const ProfileStatusBadge = ({ status }: { status: ProfileStatus }) => {
   const { label, icon: Icon, className } = profileStatuses[status]

   return (
      <Badge variant="outline" className={cn('gap-1', className)}>
         <Icon />
         {label}
      </Badge>
   )
}
