import { Button } from '@/components/ui/button'
import { CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command as CommandPrimitive } from 'cmdk'
import { Ban, Check, ChevronDown, Clock, MessageCircleReply, Search, TriangleAlert, Users } from 'lucide-react'
import { type ComponentProps, useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import {
   type Recipient,
   type RecipientPage,
   type RecipientSearch,
   type RecipientStatus,
   type UniboxAccount,
} from './types'

import { AvatarPair } from './account-avatar'
import { AccountChip } from './account-chip'
import { AccountPicker } from './account-picker'
import { setMatching } from './accountSets'
import { BLOCKED_WORDS, STATUS_WORDS, alsoTalking, countLine, noRecipients, recipientBlock } from './newMessage'
import { useShared } from './shared'
import { formatListTime } from './time'

type Picker = ComponentProps<typeof AccountPicker>

type Props = {
   // What the address carries into the search box.
   initialQuery: string
   load: (search: RecipientSearch) => Promise<RecipientPage>
   // False while a first message cannot be sent yet: only people already talked to can be picked.
   canStart: boolean
   accounts: UniboxAccount[]
   // The accounts it starts on (undefined is every account), and the owner's choice, kept by the page for the next time.
   startAccounts: ReadonlySet<string> | undefined
   onAccounts: (next: ReadonlySet<string> | undefined) => void
   picker: Pick<Picker, 'unread' | 'sets' | 'onSets'>
   // A person picked: their conversation opens, or a new one when the account has never written to them.
   onPick: (person: Recipient) => void
   onClose: () => void
}

type Answer = { key: string; page: RecipientPage | 'error' }

const WAIT_MS = 200

const CHIP = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[11px] leading-5 font-medium'

const LOOKS: Record<RecipientStatus, { className: string; icon?: typeof Clock }> = {
   NEEDS_REPLY: {
      className: 'border-primary/30 bg-primary/10 text-primary',
      icon: MessageCircleReply,
   },
   WAITING: {
      className: 'border-warning/30 bg-warning/10 text-warning',
      icon: Clock,
   },
   TALKED: {
      className: 'border-border bg-muted text-muted-foreground',
      icon: Check,
   },
   NEVER: { className: 'border-border text-muted-foreground' },
}

const STATUSES = Object.keys(STATUS_WORDS) as RecipientStatus[]

const StatusChip = ({ person, canStart }: { person: Recipient; canStart: boolean }) => {
   if (person.blocked) {
      return (
         <span className={cn(CHIP, 'border-border text-muted-foreground')}>
            <Ban className="size-3" aria-hidden />
            {BLOCKED_WORDS}
         </span>
      )
   }

   if (person.status === 'NEVER' && !canStart) {
      return (
         <span className={cn(CHIP, 'border-dashed border-border text-muted-foreground')}>
            New conversations coming soon
         </span>
      )
   }

   const { className, icon: Icon } = LOOKS[person.status]

   return (
      <span className={cn(CHIP, className)}>
         {Icon ? <Icon className="size-3" aria-hidden /> : null}
         {STATUS_WORDS[person.status]}
      </span>
   )
}

const PersonRow = ({
   person,
   now,
   canStart,
   showAccount,
}: {
   person: Recipient
   now: number
   canStart: boolean
   showAccount: boolean
}) => {
   const { accountById } = useShared()
   const { last } = person
   const also = alsoTalking(person, id => accountById.get(id)?.name, now)

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
            {person.headline ? (
               <p className="line-clamp-2 text-xs break-words text-muted-foreground">{person.headline}</p>
            ) : null}
            {last ? (
               <p className="line-clamp-2 text-[13px] break-words">
                  <span className="text-muted-foreground">{last.mine ? 'You: ' : ''}</span>
                  {last.text || 'No words'}
               </p>
            ) : null}
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
               {showAccount ? <AccountChip account={accountById.get(person.accountId)} className="shrink" /> : null}
               <StatusChip person={person} canStart={canStart} />
            </div>
            {also ? (
               <p className="mt-0.5 flex items-center gap-1 text-xs text-warning">
                  <TriangleAlert className="size-3 shrink-0" aria-hidden />
                  {also}
               </p>
            ) : null}
         </div>
      </div>
   )
}

// New message: the connections of the owner's accounts, searched by name or title as the owner types, narrowed by account and by
// where the talk stands. Brain orders them (the ones to answer first) and says how many matched. Picking one opens its conversation, or
// a new one, to write in as for any reply.
export const NewMessage = ({
   initialQuery,
   load,
   canStart,
   accounts,
   startAccounts,
   onAccounts,
   picker,
   onPick,
   onClose,
}: Props) => {
   const { now } = useShared()
   const [query, setQuery] = useState(initialQuery)
   const [accountIds, setAccountIds] = useState(startAccounts)
   const [status, setStatus] = useState<RecipientStatus>()
   const [answer, setAnswer] = useState<Answer>()
   const trimmed = query.trim()
   const search = useMemo<RecipientSearch>(
      () => ({
         query: trimmed,
         ...(accountIds && { accountIds: [...accountIds].sort() }),
         ...(status && { status }),
      }),
      [trimmed, accountIds, status]
   )
   const key = JSON.stringify(search)

   useEffect(() => {
      let current = true
      const asked = JSON.stringify(search)
      // The first look and a filter with no words answer at once; words wait a moment for the typing to stop.
      const timer = setTimeout(
         () => {
            load(search)
               .then(page => current && setAnswer({ key: asked, page }))
               .catch(() => current && setAnswer({ key: asked, page: 'error' }))
         },
         search.query ? WAIT_MS : 0
      )

      return () => {
         current = false
         clearTimeout(timer)
      }
   }, [search, load])

   const waiting = answer?.key !== key
   const failed = answer?.page === 'error'
   const page = answer && answer.page !== 'error' ? answer.page : undefined
   const several = accounts.length > 1
   const showAccount = several && (!accountIds || accountIds.size > 1)
   const filtered = accountIds !== undefined || status !== undefined
   const activeSet = setMatching(picker.sets, accountIds)
   const accountLabel = !accountIds
      ? 'All accounts'
      : (activeSet?.name ??
        (accountIds.size === 1
           ? (accounts.find(({ id }) => accountIds.has(id))?.name ?? '1 account')
           : `${accountIds.size} accounts`))

   const chooseAccounts = (next: ReadonlySet<string> | undefined) => {
      setAccountIds(next)
      onAccounts(next)
   }

   const clear = () => {
      chooseAccounts(undefined)
      setStatus(undefined)
   }

   return (
      <Dialog open onOpenChange={open => !open && onClose()}>
         <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
            <DialogHeader className="border-b px-5 py-3.5">
               <DialogTitle className="text-base">New message</DialogTitle>
               <DialogDescription className="sr-only">
                  Find a connection of one of your accounts by name or title, narrow by account or by where you stand
                  with them, and pick one to write.
               </DialogDescription>
            </DialogHeader>
            <CommandPrimitive
               shouldFilter={false}
               loop
               label="Your connections"
               className="flex min-h-0 min-w-0 flex-col"
            >
               <div className="flex items-center gap-2 border-b px-5">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <CommandPrimitive.Input
                     value={query}
                     onValueChange={setQuery}
                     placeholder="Search by name, title or company"
                     aria-label="Search your connections"
                     autoFocus
                     className="h-11 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                  />
               </div>
               <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2">
                  {several ? (
                     <Popover>
                        <PopoverTrigger asChild>
                           <Button variant={accountIds ? 'secondary' : 'outline'} size="sm" className="max-w-56">
                              <Users />
                              <span className="truncate">{accountLabel}</span>
                              <ChevronDown className="opacity-60" />
                           </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80">
                           <AccountPicker
                              accounts={accounts}
                              selection={accountIds}
                              onChange={chooseAccounts}
                              {...picker}
                           />
                        </PopoverContent>
                     </Popover>
                  ) : null}
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button variant={status ? 'secondary' : 'outline'} size="sm">
                           {status ? STATUS_WORDS[status] : 'Any status'}
                           <ChevronDown className="opacity-60" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup
                           value={status ?? 'ANY'}
                           onValueChange={value => setStatus(STATUSES.find(item => item === value))}
                        >
                           <DropdownMenuRadioItem value="ANY">Any status</DropdownMenuRadioItem>
                           {STATUSES.map(item => (
                              <DropdownMenuRadioItem key={item} value={item}>
                                 {STATUS_WORDS[item]}
                              </DropdownMenuRadioItem>
                           ))}
                        </DropdownMenuRadioGroup>
                     </DropdownMenuContent>
                  </DropdownMenu>
                  {filtered ? (
                     <Button variant="ghost" size="sm" onClick={clear}>
                        Clear
                     </Button>
                  ) : null}
                  <span role="status" className="ml-auto text-xs text-muted-foreground">
                     {waiting ? 'Searching...' : page ? countLine(page.people.length, page.total) : ''}
                  </span>
               </div>
               <CommandList className="h-[min(28rem,60vh)] max-h-none p-2">
                  {failed && !waiting ? (
                     <p role="alert" className="px-3 py-10 text-center text-sm text-destructive">
                        The connections could not be loaded. Try again in a moment.
                     </p>
                  ) : !page ? (
                     <p className="px-3 py-10 text-center text-sm text-muted-foreground">Loading your connections...</p>
                  ) : page.people.length === 0 ? (
                     <div className="grid justify-items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
                        <p>{noRecipients(search)}</p>
                        {filtered ? (
                           <Button variant="outline" size="sm" onClick={clear}>
                              Clear filters
                           </Button>
                        ) : null}
                     </div>
                  ) : (
                     page.people.map(person => (
                        <CommandItem
                           key={`${person.accountId}:${person.slug}`}
                           value={`${person.accountId}:${person.slug}`}
                           disabled={recipientBlock(person) !== undefined || (person.status === 'NEVER' && !canStart)}
                           onSelect={() => onPick(person)}
                           className="min-w-0 rounded-md px-3 py-2.5"
                        >
                           <PersonRow person={person} now={now} canStart={canStart} showAccount={showAccount} />
                        </CommandItem>
                     ))
                  )}
               </CommandList>
            </CommandPrimitive>
         </DialogContent>
      </Dialog>
   )
}
