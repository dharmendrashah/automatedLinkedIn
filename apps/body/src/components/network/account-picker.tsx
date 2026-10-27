import { Mark } from '@/components/account-profile/mark'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { type Account } from '../accounts/types'

import { identityOf, ineligibleReason } from '../posting/accounts'

type Props = {
   accounts: Account[]
   selectedId: string | undefined
   // How many requests wait for each account, when known.
   waiting: Record<string, number>
   onPick: (accountId: string) => void
}

const countText = (count: number | undefined) =>
   count === undefined ? '' : count === 1 ? '1 waiting' : `${count} waiting`

// The account to look at. A drop-down rather than cards, so a long list of accounts still fits; one that is not signed in
// stays in it, greyed, with what to do about it.
export const AccountPicker = ({ accounts, selectedId, waiting, onPick }: Props) => (
   <Select value={selectedId} onValueChange={onPick}>
      <SelectTrigger className="h-auto min-w-64 py-1.5" aria-label="Account">
         <SelectValue placeholder="Pick an account" />
      </SelectTrigger>
      <SelectContent>
         {accounts.map(account => {
            const identity = identityOf(account, null)
            const reason = ineligibleReason(account.status)

            return (
               <SelectItem key={account.id} value={account.id} disabled={reason !== undefined} className="py-2">
                  <span className="flex items-center gap-3">
                     <Mark name={identity.name} imageUrl={identity.imageUrl} className="size-8 text-xs" />
                     <span className="grid min-w-0 text-left">
                        <span className="truncate font-medium" dir="auto">
                           {identity.name}
                        </span>
                        <span className="text-muted-foreground max-w-72 truncate text-xs">
                           {reason ?? countText(waiting[account.id])}
                        </span>
                     </span>
                  </span>
               </SelectItem>
            )
         })}
      </SelectContent>
   </Select>
)
