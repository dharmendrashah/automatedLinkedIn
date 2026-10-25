import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarClock, Trash2 } from 'lucide-react'
import { Link } from 'react-router'

import { type RouterOutputs } from '../../trpc'
import { type Account } from '../accounts/types'
import { describePlanned } from './schedule'
import { summaryOf } from './summary'

export type Draft = RouterOutputs['postDraft']['list']['items'][number]

type Props = {
   drafts: Draft[]
   accounts: Account[]
   onRemove: (draft: Draft) => void
}

const when = (iso: string) =>
   new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
   })

// The owner's drafts, newest first. Each opens in the canvas; deleting one offers Undo.
export const DraftsList = ({ drafts, accounts, onRemove }: Props) => (
   <ul className="grid gap-2">
      {drafts.map(draft => {
         const account = accounts.find(({ id }) => id === draft.accountId)
         const { words, attachment } = summaryOf(draft.blocks)

         return (
            <li key={draft.id}>
               <Card className="py-0">
                  <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                     <Link
                        to={`/posting/${draft.accountId}/${draft.id}`}
                        className="focus-visible:ring-ring grid min-w-0 gap-1 rounded-md focus-visible:ring-2 focus-visible:outline-none"
                     >
                        <span className="truncate text-sm font-medium" dir="auto">
                           {words}
                        </span>
                        <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                           <span>{account?.displayName ?? account?.email ?? 'Account removed'}</span>
                           {attachment ? <span>{attachment}</span> : null}
                           {draft.plannedAt && draft.plannedZone ? (
                              <span className="flex items-center gap-1">
                                 <CalendarClock className="size-3" aria-hidden />
                                 {describePlanned(draft.plannedAt, draft.plannedZone)}
                              </span>
                           ) : null}
                           <span>Edited {when(draft.updatedAt)}</span>
                        </span>
                     </Link>
                     <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onRemove(draft)}
                        aria-label={`Delete the draft: ${words}`}
                     >
                        <Trash2 />
                     </Button>
                  </CardContent>
               </Card>
            </li>
         )
      })}
   </ul>
)
