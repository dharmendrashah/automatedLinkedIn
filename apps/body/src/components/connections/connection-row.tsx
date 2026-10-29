import { Mark } from '@/components/account-profile/mark'
import { Button } from '@/components/ui/button'
import { ExternalLink, Loader2, MessageSquare, UserMinus } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { TONE_CLASS } from '../accounts/tone-class'
import { connectedLine, messageAction, removeBlocker, stateOf } from './describe'
import { type ConnectionAccount, type ConnectionItem } from './rows'

type Props = {
   row: ConnectionItem
   account: ConnectionAccount
   now: number
   onRemove: () => void
}

// One connection: who they are, when they connected, what became of a removal asked for, and the two things the owner can do. Message
// opens the conversation in the Unibox, or LinkedIn's own window for a person with no conversation yet; nothing is sent from here.
export const ConnectionRow = ({ row, account, now, onRemove }: Props) => {
   const state = stateOf(row, now)
   const message = messageAction(row, account.accountId)
   const blocker = removeBlocker(row, account)
   const connected = connectedLine(row.connectedOn)
   const over = row.state === 'REMOVED' || row.state === 'GONE'

   return (
      <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3', over && 'opacity-70')}>
         <Mark name={row.name} imageUrl={row.photoUrl} className="size-10 text-sm" />
         <div className="grid min-w-0 flex-1 gap-0.5">
            <a
               className="inline-flex w-fit max-w-full items-center gap-1 truncate font-medium hover:underline"
               href={`https://www.linkedin.com/in/${row.slug}/`}
               target="_blank"
               rel="noreferrer noopener"
               dir="auto"
            >
               <span className="truncate">{row.name}</span>
               <ExternalLink className="text-muted-foreground size-3 shrink-0" aria-hidden />
               <span className="sr-only">(opens LinkedIn in a new tab)</span>
            </a>
            {row.headline ? (
               <p className="text-muted-foreground line-clamp-2 text-sm" dir="auto">
                  {row.headline}
               </p>
            ) : null}
            {connected ? <p className="text-muted-foreground text-xs">{connected}</p> : null}
            {state ? (
               <p className="flex flex-wrap items-center gap-2 text-xs" role="status">
                  <span
                     className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                        TONE_CLASS[state.tone]
                     )}
                  >
                     {state.tone === 'busy' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                     {state.label}
                  </span>
                  <span className="text-muted-foreground">{state.line}</span>
               </p>
            ) : null}
         </div>
         {over ? null : (
            <div className="flex items-center gap-2">
               <Button asChild variant="outline" size="sm">
                  <Link
                     to={message}
                     title={
                        row.conversationId
                           ? 'Opens the conversation in the Unibox.'
                           : 'Opens New message in the Unibox to write the first message.'
                     }
                  >
                     <MessageSquare aria-hidden />
                     Message
                  </Link>
               </Button>
               <Button
                  variant="outline"
                  size="sm"
                  onClick={onRemove}
                  disabled={blocker !== undefined}
                  title={blocker}
                  aria-label={`Remove ${row.name}`}
               >
                  <UserMinus aria-hidden />
                  Remove
               </Button>
            </div>
         )}
      </li>
   )
}
