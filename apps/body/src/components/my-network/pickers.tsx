import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { type Workspace } from './types'

const ALL_ACCOUNTS = 'all'

type Props = {
   accounts: Workspace['accounts']
   accountId: string | undefined
   onAccount: (accountId: string | undefined) => void
}

const accountName = ({ displayName, email }: Workspace['accounts'][number]) => displayName ?? email

// The account picker, shown with several accounts.
export const Pickers = ({ accounts, accountId, onAccount }: Props) =>
   accounts.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2">
         <Select
            value={accounts.some(({ id }) => id === accountId) ? accountId : ALL_ACCOUNTS}
            onValueChange={value => onAccount(value === ALL_ACCOUNTS ? undefined : value)}
         >
            <SelectTrigger size="sm" className="w-56" aria-label="Account">
               <SelectValue />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
               {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                     {accountName(account)}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
      </div>
   ) : null
