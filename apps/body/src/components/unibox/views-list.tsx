import { AlertCircle, CheckCheck, Inbox, Mail, MessageCircleReply, Pencil, Reply } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type View } from './types'

import { visibleViews } from './inbox'
import { viewLabel } from './views'

const ICONS: Record<View, typeof Inbox> = {
   ALL: Inbox,
   NEEDS_REPLY: MessageCircleReply,
   UNREAD: Mail,
   REPLIED: Reply,
   DRAFTS: Pencil,
   FAILED: AlertCircle,
   DONE: CheckCheck,
}

type Props = {
   counts: Record<View, number>
   active: View
   onChange: (view: View) => void
   // A column in the rail, or a row that scrolls sideways on a narrow screen.
   row?: boolean
}

// The views of the Unibox with how many each holds. Drafts, Failed and Done appear only while they hold something.
export const ViewsList = ({ counts, active, onChange, row = false }: Props) => (
   <nav
      aria-label="Views"
      className={cn(row ? 'flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]' : 'flex flex-col gap-0.5 p-2')}
   >
      {visibleViews(counts, active).map(view => {
         const Icon = ICONS[view]

         return (
            <button
               key={view}
               type="button"
               onClick={() => onChange(view)}
               aria-current={view === active ? 'page' : undefined}
               className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  view === active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-accent'
               )}
            >
               <Icon className="size-4" aria-hidden />
               {viewLabel(view)}
               <span
                  className={cn(
                     'ml-auto text-xs tabular-nums',
                     view === active ? 'text-primary' : 'text-muted-foreground'
                  )}
               >
                  {counts[view].toLocaleString('en-US')}
               </span>
            </button>
         )
      })}
   </nav>
)
