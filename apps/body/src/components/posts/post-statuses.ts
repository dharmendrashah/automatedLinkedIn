import { CircleCheck, CircleDot } from 'lucide-react'

import { type StatusStyle } from '../links/link-status-badge'
import { type PostStatus } from './types'

export const postStatuses: Record<PostStatus, StatusStyle> = {
   UNPROCESSED: {
      label: 'Unprocessed',
      icon: CircleDot,
      className: 'border-border text-muted-foreground',
   },
   PROCESSED: {
      label: 'Processed',
      icon: CircleCheck,
      className: 'bg-success/10 text-success',
   },
}
