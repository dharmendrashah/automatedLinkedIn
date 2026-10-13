import { CircleDot, type LucideIcon, MessageSquareReply, Send } from 'lucide-react'

import { type LinkStatus } from './types'

export const linkStatuses: Record<LinkStatus, { label: string; icon: LucideIcon; className: string }> = {
   NEW: {
      label: 'New',
      icon: CircleDot,
      className: 'border-border text-muted-foreground',
   },
   CONTACTED: {
      label: 'Contacted',
      icon: Send,
      className: 'bg-warning/10 text-warning',
   },
   REPLIED: {
      label: 'Replied',
      icon: MessageSquareReply,
      className: 'bg-success/10 text-success',
   },
}

export const isLinkStatus = (value: string): value is LinkStatus => value in linkStatuses
