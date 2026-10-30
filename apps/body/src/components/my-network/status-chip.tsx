import { Badge } from '@/components/ui/badge'
import { CircleCheck, CircleDot, CircleX, Loader, MessageCircleReply } from 'lucide-react'
import { type ComponentType } from 'react'

import { type PersonStatus, statusWord } from './words'

const LOOK: Record<PersonStatus, { icon: ComponentType<{ className?: string }>; color: string }> = {
   NEW: { icon: CircleDot, color: 'text-sky-500' },
   CONTACTED: { icon: Loader, color: 'text-amber-500' },
   REPLIED: { icon: MessageCircleReply, color: 'text-violet-500' },
   NOT_INTERESTED: { icon: CircleX, color: 'text-rose-500' },
   DONE: { icon: CircleCheck, color: 'text-emerald-500' },
}

// A person's status as a chip with its own colour and icon.
export const StatusChip = ({ status }: { status: PersonStatus }) => {
   const { icon: Icon, color } = LOOK[status]

   return (
      <Badge variant="outline" className="text-muted-foreground gap-1 rounded-full px-2 font-normal">
         <Icon className={`size-3.5 ${color}`} aria-hidden />
         {statusWord(status)}
      </Badge>
   )
}
