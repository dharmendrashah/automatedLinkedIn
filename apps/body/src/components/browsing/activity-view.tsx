import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { type AccountBrowse } from './types'

import { BulkBrowseBar } from './bulk-browse-bar'
import { formatMinutes, meterText } from './format'
import { limitSecondsOf, modeOf } from './modes'
import { NEAR_FULL_SHARE, clientGroups, sortByUse } from './overview'
import { UseBar } from './use-bar'

// Thirty small bars, one per day, tall by the share of the day's limit; amber above it.
const Strip = ({ account }: { account: AccountBrowse }) => {
   const limit = limitSecondsOf(account.mode)

   return (
      <span className="flex h-6 items-end gap-px" role="img" aria-label="Browsing on each of the last 30 days">
         {account.last30.map((seconds, index) => (
            <span
               key={index}
               className={cn(
                  'w-1 rounded-[1px]',
                  seconds === 0 ? 'bg-muted' : seconds > limit ? 'bg-warning' : 'bg-primary/70'
               )}
               style={{ height: seconds === 0 ? 2 : `${Math.max(12, Math.min(100, (seconds / limit) * 100))}%` }}
            />
         ))}
      </span>
   )
}

type RowProps = {
   account: AccountBrowse
   selected: boolean
   onSelect: (selected: boolean) => void
   onOpen: () => void
}

const Row = ({ account, selected, onSelect, onOpen }: RowProps) => {
   const limit = limitSecondsOf(account.mode)
   const near = account.usedSeconds / limit >= NEAR_FULL_SHARE

   return (
      <li className="flex items-center gap-3 px-3 py-2">
         <Checkbox
            checked={selected}
            aria-label={`Select ${account.email}`}
            onCheckedChange={value => onSelect(value === true)}
         />
         <button
            type="button"
            className="hover:bg-muted/50 focus-visible:ring-ring/50 grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md p-1 text-left outline-none focus-visible:ring-[3px] sm:grid-cols-[minmax(0,1fr)_9rem_8rem]"
            onClick={onOpen}
         >
            <span className="flex min-w-0 flex-wrap items-center gap-2">
               <span className="truncate text-sm font-medium">{account.email}</span>
               {account.clientLabel ? <Badge variant="outline">{account.clientLabel}</Badge> : null}
               <Badge variant="secondary">{modeOf(account.mode).label}</Badge>
            </span>
            <span className="grid gap-1">
               {account.state === 'NOT_BROWSING' ? (
                  <span className="text-muted-foreground text-sm">Not browsing</span>
               ) : (
                  <>
                     <span className={cn('text-sm tabular-nums', near && 'text-warning')}>
                        {meterText(account.usedSeconds, limit)}
                     </span>
                     <UseBar usedSeconds={account.usedSeconds} limitSeconds={limit} />
                  </>
               )}
            </span>
            <span className="hidden sm:block">
               <Strip account={account} />
            </span>
         </button>
      </li>
   )
}

type Props = {
   accounts: AccountBrowse[]
   sample: boolean
   onOpen: (accountId: string) => void
}

// Every account in one compact row: today's use and the last 30 days. A click opens the drawer with the year; rows can be picked
// for a change to all of them, and grouped by client.
export const ActivityView = ({ accounts, sample, onOpen }: Props) => {
   const [query, setQuery] = useState('')
   const [grouped, setGrouped] = useState(false)
   const [picked, setPicked] = useState<Set<string>>(new Set())
   const visible = useMemo(
      () =>
         sortByUse(accounts).filter(({ email, clientLabel }) =>
            `${email} ${clientLabel ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
         ),
      [accounts, query]
   )
   const selected = accounts.filter(({ accountId }) => picked.has(accountId))
   const groups = grouped ? clientGroups(visible) : [{ label: null, accounts: visible, usedSeconds: 0 }]

   const toggle = (id: string, on: boolean) =>
      setPicked(current => {
         const next = new Set(current)

         if (on) {
            next.add(id)
         } else {
            next.delete(id)
         }

         return next
      })

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center gap-3">
            <Input
               aria-label="Search accounts"
               placeholder="Search by email or client"
               className="w-64"
               value={query}
               onChange={event => setQuery(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
               <Checkbox checked={grouped} onCheckedChange={value => setGrouped(value === true)} />
               Group by client
            </label>
         </div>
         {selected.length > 0 ? (
            <BulkBrowseBar accounts={selected} sample={sample} onClear={() => setPicked(new Set())} />
         ) : null}
         {visible.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
               No accounts match.
            </p>
         ) : (
            groups.map(group => (
               <section key={group.label ?? 'none'} className="grid gap-1">
                  {grouped ? (
                     <h3 className="flex items-baseline justify-between px-1 text-sm font-semibold">
                        {group.label ?? 'No client'}
                        <span className="text-muted-foreground text-xs font-normal">
                           {formatMinutes(group.usedSeconds)} today, {group.accounts.length}{' '}
                           {group.accounts.length === 1 ? 'account' : 'accounts'}
                        </span>
                     </h3>
                  ) : null}
                  <ul className="divide-y rounded-lg border">
                     {group.accounts.map(account => (
                        <Row
                           key={account.accountId}
                           account={account}
                           selected={picked.has(account.accountId)}
                           onSelect={on => toggle(account.accountId, on)}
                           onOpen={() => onOpen(account.accountId)}
                        />
                     ))}
                  </ul>
               </section>
            ))
         )}
      </div>
   )
}
