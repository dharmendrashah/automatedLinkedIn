import { Mark } from '@/components/account-profile/mark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Check, ExternalLink, Loader2, Users, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { type Answer, type Held, type NetworkRequest } from './types'

import { type Tone, detailText, holdText, stateBadge } from './answer-state'
import { profileUrl } from './rows'
import { canChoose } from './selection'

type Props = {
   request: NetworkRequest
   // The answer waiting its few seconds in this browser, which can still be undone.
   held: Held | undefined
   chosen: boolean
   // Why this request cannot be chosen now, when only the cap stops it.
   fullReason: string | undefined
   now: Date
   onChoose: () => void
   onAnswer: (action: Answer) => void
   onUndo: () => void
}

const NOTE_CUT = 140

const tones: Record<Tone, string> = {
   good: 'border-success/30 bg-success/10 text-success',
   muted: 'text-muted-foreground',
   warn: 'border-warning/30 bg-warning/10 text-warning',
   bad: 'border-destructive/30 bg-destructive/10 text-destructive',
   busy: 'text-muted-foreground',
}

// What the sender wrote, cut to two lines until the owner asks for the rest.
const Note = ({ text }: { text: string }) => {
   const [open, setOpen] = useState(false)
   const long = text.length > NOTE_CUT

   return (
      <div className="mt-1 border-l-2 pl-3">
         <p className={cn('text-sm whitespace-pre-line', long && !open && 'line-clamp-2')} dir="auto">
            {text}
         </p>
         {long ? (
            <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setOpen(!open)}>
               {open ? 'Show less' : 'Show more'}
            </Button>
         ) : null}
      </div>
   )
}

// One request: who it is from, what they wrote, and the two answers on the right. A request that is over wears how it ended
// instead of the buttons, and one whose answer is waiting its few seconds counts them down with an Undo.
export const RequestRow = ({ request, held, chosen, fullReason, now, onChoose, onAnswer, onUndo }: Props) => {
   const badge = stateBadge(request, now)
   const detail = detailText(request, now)
   const over = request.state !== 'WAITING' && request.state !== 'QUEUED'
   const open = canChoose(request) && held === undefined

   return (
      <li
         className={cn(
            'flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 transition-colors',
            chosen ? 'bg-primary/5' : 'hover:bg-muted/40',
            over && request.state !== 'GONE' && 'opacity-80'
         )}
      >
         {open ? (
            <Checkbox
               checked={chosen}
               disabled={!chosen && fullReason !== undefined}
               title={chosen ? undefined : fullReason}
               onCheckedChange={onChoose}
               aria-label={`Choose ${request.name}`}
               className="mt-3"
            />
         ) : (
            <span className="mt-3 size-4 shrink-0" aria-hidden />
         )}
         <Mark name={request.name} imageUrl={request.photoUrl} className="size-10 text-sm" />
         <div className="grid min-w-56 flex-1 gap-0.5">
            <a
               href={profileUrl(request.slug)}
               target="_blank"
               rel="noopener noreferrer"
               className="group inline-flex max-w-full items-center gap-1 font-medium hover:underline"
               dir="auto"
            >
               <span className="truncate">{request.name}</span>
               <ExternalLink
                  className="text-muted-foreground size-3 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
               />
               <span className="sr-only">Opens the profile on LinkedIn</span>
            </a>
            <p className="text-muted-foreground line-clamp-2 text-sm" dir="auto">
               {request.headline}
            </p>
            {request.mutual ? (
               <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Users className="size-3 shrink-0" aria-hidden />
                  {request.mutual}
               </p>
            ) : null}
            {request.note ? <Note text={request.note} /> : null}
            {detail ? (
               <p className="pt-1 text-sm" role="status">
                  {detail}
               </p>
            ) : null}
         </div>
         <div className="ml-auto flex items-center gap-2 self-start pt-0.5">
            {held ? (
               <>
                  <span className="text-muted-foreground text-sm tabular-nums" role="status">
                     {holdText(held, now)}
                  </span>
                  <Button variant="outline" size="sm" onClick={onUndo}>
                     Undo
                  </Button>
               </>
            ) : badge ? (
               <Badge variant="outline" className={cn('gap-1.5 py-1', tones[badge.tone])}>
                  {badge.tone === 'busy' ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {badge.label}
               </Badge>
            ) : (
               <>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => onAnswer('IGNORE')}
                     aria-label={`Ignore ${request.name}`}
                  >
                     <X aria-hidden />
                     Ignore
                  </Button>
                  <Button size="sm" onClick={() => onAnswer('ACCEPT')} aria-label={`Accept ${request.name}`}>
                     <Check aria-hidden />
                     Accept
                  </Button>
               </>
            )}
         </div>
      </li>
   )
}
