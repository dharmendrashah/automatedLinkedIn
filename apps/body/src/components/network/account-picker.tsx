import { Mark } from '@/components/account-profile/mark'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronsUpDown, Users } from 'lucide-react'

import { type Account } from '../accounts/types'

import { identityOf, ineligibleReason } from '../posting/accounts'
import { toggleAccount } from './accounts-pick'

type Props = {
   accounts: Account[]
   // The accounts that are shown now.
   shown: string[]
   // How many requests wait for each account, when known.
   waiting: Record<string, number>
   // The accounts the owner narrowed it to; none means all of them.
   onChange: (picked: string[]) => void
}

const countText = (count: number | undefined) =>
   count === undefined ? '' : count === 1 ? '1 waiting' : `${count} waiting`

// The accounts to look at: all the signed-in ones, or one or several. An account that is not signed in stays in the list, greyed, with
// what to do about it.
export const AccountPicker = ({ accounts, shown, waiting, onChange }: Props) => {
   const usable = accounts.filter(({ status }) => ineligibleReason(status) === undefined)
   const usableIds = usable.map(({ id }) => id)
   const all = shown.length === usable.length
   const [only] = shown.length === 1 ? usable.filter(({ id }) => shown.includes(id)) : []
   const identity = only ? identityOf(only, null) : undefined

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button variant="outline" className="h-auto min-w-64 justify-between py-1.5" aria-label="Accounts">
               <span className="flex items-center gap-2">
                  {identity ? (
                     <Mark name={identity.name} imageUrl={identity.imageUrl} className="size-6 text-[10px]" />
                  ) : (
                     <Users className="text-muted-foreground size-4" aria-hidden />
                  )}
                  <span className="truncate font-medium" dir="auto">
                     {identity ? identity.name : all ? `All accounts (${usable.length})` : `${shown.length} accounts`}
                  </span>
               </span>
               <ChevronsUpDown className="text-muted-foreground size-4" aria-hidden />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-80 p-1">
            <label className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-md px-2 py-2">
               <Checkbox checked={all} disabled={all} onCheckedChange={() => onChange([])} />
               <span className="text-sm font-medium">All signed-in accounts</span>
            </label>
            <ul className="max-h-80 overflow-auto">
               {accounts.map(account => {
                  const who = identityOf(account, null)
                  const reason = ineligibleReason(account.status)

                  return (
                     <li key={account.id}>
                        <label
                           className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                              reason === undefined ? 'hover:bg-muted cursor-pointer' : 'cursor-not-allowed opacity-60'
                           }`}
                        >
                           <Checkbox
                              checked={shown.includes(account.id)}
                              disabled={reason !== undefined}
                              onCheckedChange={() => onChange(toggleAccount(usableIds, shown, account.id))}
                           />
                           <Mark name={who.name} imageUrl={who.imageUrl} className="size-8 text-xs" />
                           <span className="grid min-w-0 text-left">
                              <span className="truncate text-sm font-medium" dir="auto">
                                 {who.name}
                              </span>
                              <span className="text-muted-foreground truncate text-xs">
                                 {reason ?? countText(waiting[account.id])}
                              </span>
                           </span>
                        </label>
                     </li>
                  )
               })}
            </ul>
         </PopoverContent>
      </Popover>
   )
}
