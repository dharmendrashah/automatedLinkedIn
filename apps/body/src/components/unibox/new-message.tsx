import { CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Command as CommandPrimitive } from 'cmdk'
import { Check, Clock, MessageCircleReply, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Recipient } from './types'

import { AvatarPair } from './account-avatar'
import { AccountChip } from './account-chip'
import { type Entry, type EntryState, connectionEntries, noRecipients, recipientBlock } from './newMessage'
import { useShared } from './shared'
import { formatListTime } from './time'

type Props = {
   // What the address carries into the search box (a link from the Connections page).
   initialQuery: string
   load: (query: string) => Promise<Recipient[]>
   // False while a first message cannot be sent yet: only people already talked to can be picked.
   canStart: boolean
   // A person picked: their conversation opens, or a new one when the account has never written to them.
   onPick: (person: Recipient) => void
   onClose: () => void
}

type Answer = { key: string; people: Recipient[] | 'error' }

const WAIT_MS = 200

const CHIP = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[11px] leading-5 font-medium'

const STATES: Record<EntryState, { label: string; className: string; icon?: typeof Clock }> = {
   NEEDS_REPLY: {
      label: 'Needs reply',
      className: 'border-primary/30 bg-primary/10 text-primary',
      icon: MessageCircleReply,
   },
   WAITING: {
      label: 'Waiting for their reply',
      className: 'border-warning/30 bg-warning/10 text-warning',
      icon: Clock,
   },
   TALKED: {
      label: 'Done',
      className: 'border-border bg-muted text-muted-foreground',
      icon: Check,
   },
   NEW: {
      label: 'New conversation',
      className: 'border-border text-muted-foreground',
   },
   BLOCKED: {
      label: 'Do not contact',
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
   },
}

// A person never written to, while a first message cannot be sent from here yet.
const NOT_YET: (typeof STATES)[EntryState] = {
   label: 'New conversations coming soon',
   className: 'border-dashed border-border text-muted-foreground',
}

const ConnectionRow = ({ entry, now, canStart }: { entry: Entry; now: number; canStart: boolean }) => {
   const { accountById } = useShared()
   const { person, state, last } = entry
   const look = state === 'NEW' && !canStart ? NOT_YET : STATES[state]
   const Icon = look.icon

   return (
      <div className="flex w-full min-w-0 gap-3">
         <AvatarPair
            contact={person.name}
            contactImage={person.imageUrl}
            account={accountById.get(person.accountId)}
            direction={last?.mine === false ? 'THEM' : 'ME'}
         />
         <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
               <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
               {last ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                     {formatListTime(last.at, now)}
                  </span>
               ) : null}
            </div>
            {person.headline ? <p className="truncate text-xs text-muted-foreground">{person.headline}</p> : null}
            {last ? (
               <p className="truncate text-[13px]">
                  <span className="text-muted-foreground">{last.mine ? 'You: ' : ''}</span>
                  {last.text || 'No words'}
               </p>
            ) : null}
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
               <AccountChip account={accountById.get(person.accountId)} className="shrink" />
               <span className={cn(CHIP, look.className)}>
                  {Icon ? <Icon className="size-3" aria-hidden /> : null}
                  {look.label}
               </span>
            </div>
         </div>
      </div>
   )
}

// New message: the connections of every account in one list, searched as the owner types. Each says which account it belongs to and
// where the talk stands. Picking one opens its conversation (a new one when there is none) to write in, as for any reply.
export const NewMessage = ({ initialQuery, load, canStart, onPick, onClose }: Props) => {
   const { index, now } = useShared()
   const [query, setQuery] = useState(initialQuery)
   const [answer, setAnswer] = useState<Answer>()
   const key = query.trim()

   useEffect(() => {
      let current = true
      // The first look is at once; the ones while typing wait a moment.
      const timer = setTimeout(
         () => {
            load(key)
               .then(people => current && setAnswer({ key, people }))
               .catch(() => current && setAnswer({ key, people: 'error' }))
         },
         key ? WAIT_MS : 0
      )

      return () => {
         current = false
         clearTimeout(timer)
      }
   }, [key, load])

   const waiting = answer?.key !== key
   const failed = answer?.people === 'error'
   const people = answer && answer.people !== 'error' ? answer.people : undefined
   const entries = useMemo(() => (people ? connectionEntries(people, index.byId) : []), [people, index])

   return (
      <Dialog open onOpenChange={open => !open && onClose()}>
         <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
            <DialogHeader className="border-b px-5 py-3.5">
               <DialogTitle className="text-base">New message</DialogTitle>
               <DialogDescription className="sr-only">
                  Pick a connection of one of your accounts to open the conversation with them and write.
               </DialogDescription>
            </DialogHeader>
            <CommandPrimitive shouldFilter={false} loop label="Your connections" className="flex min-h-0 flex-col">
               <div className="flex items-center gap-2 border-b px-5">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <CommandPrimitive.Input
                     value={query}
                     onValueChange={setQuery}
                     placeholder="Search your connections by name or title"
                     aria-label="Search your connections"
                     autoFocus
                     className="h-11 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                  />
               </div>
               <CommandList className="h-[min(28rem,60vh)] max-h-none p-2">
                  <p role="status" className="sr-only">
                     {waiting ? 'Searching' : `${entries.length} found`}
                  </p>
                  {failed && !waiting ? (
                     <p role="alert" className="px-3 py-10 text-center text-sm text-destructive">
                        The connections could not be loaded. Try again in a moment.
                     </p>
                  ) : !people ? (
                     <p className="px-3 py-10 text-center text-sm text-muted-foreground">Loading your connections...</p>
                  ) : entries.length === 0 ? (
                     <p className="px-6 py-10 text-center text-sm text-muted-foreground">{noRecipients(query)}</p>
                  ) : (
                     entries.map(entry => (
                        <CommandItem
                           key={`${entry.person.accountId}:${entry.person.slug}`}
                           value={`${entry.person.accountId}:${entry.person.slug}`}
                           disabled={recipientBlock(entry.person) !== undefined || (entry.state === 'NEW' && !canStart)}
                           onSelect={() => onPick(entry.person)}
                           className="rounded-md px-3 py-2.5"
                        >
                           <ConnectionRow entry={entry} now={now} canStart={canStart} />
                        </CommandItem>
                     ))
                  )}
               </CommandList>
            </CommandPrimitive>
         </DialogContent>
      </Dialog>
   )
}
