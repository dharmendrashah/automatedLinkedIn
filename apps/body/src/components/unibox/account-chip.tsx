import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { type CSSProperties } from 'react'

import { cn } from '@/lib/utils'

import { type UniboxAccount } from './types'

import { AccountAvatar } from './account-avatar'
import { stateLabel } from './account-state'
import { hueOf } from './colors'
import { useShared } from './shared'
import { agoOf } from './time'

type Props = {
   account: UniboxAccount | undefined
   // "To" or "From": which way the last message went, so the chip says it.
   prefix?: string
   className?: string
}

// The account's name in its own colour, with a small card on hover. Two accounts with one name also show their handle.
export const AccountChip = ({ account, prefix, className }: Props) => {
   const { ambiguousNames, now, today } = useShared()

   if (!account) {
      return <span className={cn('text-xs text-muted-foreground', className)}>Unknown account</span>
   }

   const label = ambiguousNames.has(account.name) ? `${account.name} (${account.handle})` : account.name

   return (
      <HoverCard openDelay={250} closeDelay={80}>
         <HoverCardTrigger asChild>
            <span
               style={{ '--h': hueOf(account.id) } as CSSProperties}
               className={cn(
                  'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full py-px pr-2 pl-px text-[11px] leading-5',
                  'bg-[oklch(0.95_0.03_var(--h))] text-[oklch(0.35_0.1_var(--h))] dark:bg-[oklch(0.3_0.05_var(--h))] dark:text-[oklch(0.88_0.08_var(--h))]',
                  className
               )}
            >
               <AccountAvatar account={account} size="xs" />
               <span className="truncate">
                  {prefix ? <span className="opacity-70">{prefix} </span> : null}
                  {label}
               </span>
            </span>
         </HoverCardTrigger>
         <HoverCardContent className="w-72">
            <div className="flex items-start gap-3">
               <AccountAvatar account={account} size="lg" />
               <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{account.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{account.handle}</p>
                  <p className="mt-1 text-xs">{account.headline}</p>
               </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
               <dt className="text-muted-foreground">State</dt>
               <dd className={account.state === 'ACTIVE' ? 'text-success' : 'text-warning'}>
                  {stateLabel(account.state)}
               </dd>
               <dt className="text-muted-foreground">Last read</dt>
               <dd>{account.lastReadAt ? agoOf(account.lastReadAt, now) : 'Never'}</dd>
               <dt className="text-muted-foreground">Messages today</dt>
               <dd>{today.get(account.id) ?? 0}</dd>
            </dl>
         </HoverCardContent>
      </HoverCard>
   )
}
