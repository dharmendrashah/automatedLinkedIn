import { Mark } from '@/components/account-profile/mark'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { StatusBadge } from '../accounts/status-badge'
import { type Account } from '../accounts/types'
import { identityOf, ineligibleReason } from './accounts'

// One account to write a post for. Only an account that is signed in can be picked; the others stay in the list, greyed, with
// what to do about them, so nobody wonders where an account went.
export const AccountCard = ({ account }: { account: Account }) => {
   const identity = identityOf(account, null)
   const reason = ineligibleReason(account.status)
   const body = (
      <>
         <Mark name={identity.name} imageUrl={identity.imageUrl} className="size-12 text-base" />
         <div className="grid min-w-0 gap-1">
            <p className="truncate font-medium" dir="auto">
               {identity.name}
            </p>
            {identity.known ? <p className="text-muted-foreground truncate text-xs">{account.email}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
               <StatusBadge status={account.status} message={account.statusMessage} />
               {reason ? null : <Badge variant="outline">Ready to post</Badge>}
            </div>
            {reason ? <p className="text-muted-foreground text-xs">{reason}</p> : null}
         </div>
         {reason ? null : <ArrowRight className="text-muted-foreground size-4 self-center" aria-hidden />}
      </>
   )
   const frame = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border bg-card p-4'

   return reason ? (
      <div aria-disabled="true" className={cn(frame, 'opacity-70')}>
         {body}
      </div>
   ) : (
      <Link
         to={`/posting/${account.id}`}
         aria-label={`Write a post as ${identity.name}`}
         className={cn(frame, 'hover:border-primary focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none')}
      >
         {body}
      </Link>
   )
}
