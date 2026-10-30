import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { type Client } from './types'

import { ALL_CLIENTS } from './address'

const ALL_ACCOUNTS = 'all'

type Props = {
   clients: Client[]
   // The client shown, or ALL_CLIENTS.
   clientId: string
   accountId: string | undefined
   onClient: (clientId: string) => void
   onAccount: (accountId: string | undefined) => void
}

const accountName = ({ displayName, email }: Client['accounts'][number]) => displayName ?? email

// The client first (hidden with one client), then one of its accounts (hidden with one account).
export const Pickers = ({ clients, clientId, accountId, onClient, onAccount }: Props) => {
   const client = clients.find(({ id }) => id === clientId)
   const accounts = client?.accounts ?? []

   return (
      <div className="flex flex-wrap items-center gap-2">
         {clients.length > 1 ? (
            <Select value={clientId} onValueChange={onClient}>
               <SelectTrigger size="sm" className="w-48" aria-label="Client">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
                  {clients.map(({ id, name }) => (
                     <SelectItem key={id} value={id}>
                        {name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         ) : null}
         {accounts.length > 1 ? (
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
         ) : null}
      </div>
   )
}
