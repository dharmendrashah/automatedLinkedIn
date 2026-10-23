import { Check, CircleAlert, Loader2, MessageCircleReply, Undo2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type ConversationStatus } from './types'

import { formatFull, formatListTime } from './time'

type Props = {
   status: ConversationStatus
   lastReplyAt: number | undefined
   now: number
   // The long form, for the header of a conversation: "Last reply: Oct 23, 5:18 PM".
   long?: boolean
   className?: string
}

const BASE =
   'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[11px] leading-5 font-medium whitespace-nowrap'

// What the owner needs to do about a conversation, or has done. Replied shows its date; the full date and time are on hover.
export const StatusChip = ({ status, lastReplyAt, now, long = false, className }: Props) => {
   switch (status) {
      case 'NEEDS_REPLY':
         return (
            <span className={cn(BASE, 'border-primary/30 bg-primary/10 text-primary', className)}>
               <MessageCircleReply className="size-3" aria-hidden />
               Needs reply
            </span>
         )
      case 'REPLYING':
         return (
            <span className={cn(BASE, 'border-warning/30 bg-warning/10 text-warning', className)} role="status">
               <Loader2 className="size-3 animate-spin" aria-hidden />
               Replying
            </span>
         )
      case 'REPLIED':
         return (
            <span
               className={cn(BASE, 'border-success/30 bg-success/10 text-success', className)}
               title={lastReplyAt ? `Last reply: ${formatFull(lastReplyAt)}` : undefined}
            >
               <Check className="size-3" aria-hidden />
               {lastReplyAt
                  ? long
                     ? `Replied. Last reply ${formatFull(lastReplyAt)}`
                     : `Replied ${formatListTime(lastReplyAt, now)}`
                  : 'Replied'}
            </span>
         )
      case 'FAILED':
         return (
            <span
               className={cn(BASE, 'border-destructive/30 bg-destructive/10 text-destructive', className)}
               role="status"
            >
               <CircleAlert className="size-3" aria-hidden />
               Failed
            </span>
         )
      case 'DONE':
         return (
            <span className={cn(BASE, 'border-border bg-muted text-muted-foreground', className)}>
               <Undo2 className="size-3 rotate-180" aria-hidden />
               Done
            </span>
         )
      case 'NONE':
         return null
   }
}
