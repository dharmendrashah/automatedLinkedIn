import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { useState } from 'react'

import { type Client } from './types'

import { trpc } from '../../trpc'
import { ALL_CLIENTS, showClientPicker } from './address'
import { NameDialog } from './name-dialog'

const ALL_ACCOUNTS = 'all'
// Picker entries that open a dialog instead of picking a client (client ids never take these values).
const NEW_CLIENT = '+new-client'
const RENAME_CLIENT = '+rename-client'
const CLIENT_NAME_MAX = 80

type Naming = 'new' | 'rename' | null

type Props = {
   clients: Client[]
   // The client shown, or ALL_CLIENTS.
   clientId: string
   accountId: string | undefined
   onClient: (clientId: string) => void
   onAccount: (accountId: string | undefined) => void
}

const accountName = ({ displayName, email }: Client['accounts'][number]) => displayName ?? email

// New client and Rename client, opened from the client picker.
const ClientDialogs = ({
   naming,
   client,
   onClose,
   onCreated,
}: {
   naming: Naming
   client: Client | undefined
   onClose: () => void
   onCreated: (clientId: string) => void
}) => {
   const utils = trpc.useUtils()
   const create = trpc.people.createClient.useMutation({
      onSuccess: async made => {
         onClose()
         await utils.people.invalidate()
         onCreated(made.id)
      },
   })
   const rename = trpc.people.renameClient.useMutation({
      onSuccess: async () => {
         onClose()
         await utils.people.invalidate()
      },
   })
   const close = (open: boolean) => {
      if (!open) {
         create.reset()
         rename.reset()
         onClose()
      }
   }

   return (
      <>
         <NameDialog
            open={naming === 'new'}
            onOpenChange={close}
            title="New client"
            description="A client keeps its own people, statuses and notes. Move accounts to it on the Accounts page."
            label="Client name"
            maxLength={CLIENT_NAME_MAX}
            action="Add client"
            busy={create.isPending}
            error={create.error ? readableError(create.error) : null}
            onSave={name => create.mutate({ name })}
         />
         {client ? (
            <NameDialog
               open={naming === 'rename'}
               onOpenChange={close}
               title={`Rename ${client.name}`}
               description="Only the name changes. Its accounts and people stay."
               label="Client name"
               initial={client.name}
               maxLength={CLIENT_NAME_MAX}
               action="Rename"
               busy={rename.isPending}
               error={rename.error ? readableError(rename.error) : null}
               onSave={name =>
                  rename.mutate({
                     id: client.id,
                     name,
                  })
               }
            />
         ) : null}
      </>
   )
}

// The client first (shown with several clients or accounts), then one of its accounts (hidden with one account).
export const Pickers = ({ clients, clientId, accountId, onClient, onAccount }: Props) => {
   const [naming, setNaming] = useState<Naming>(null)
   const client = clients.find(({ id }) => id === clientId)
   const accounts = client?.accounts ?? []

   const pickClient = (value: string) => {
      if (value === NEW_CLIENT) {
         setNaming('new')
      } else if (value === RENAME_CLIENT) {
         setNaming('rename')
      } else {
         onClient(value)
      }
   }

   if (!showClientPicker(clients) && accounts.length <= 1) {
      return null
   }

   return (
      <div className="flex flex-wrap items-center gap-2">
         {showClientPicker(clients) ? (
            <Select value={clientId} onValueChange={pickClient}>
               <SelectTrigger size="sm" className="w-48" aria-label="Client">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {clients.length > 1 ? <SelectItem value={ALL_CLIENTS}>All clients</SelectItem> : null}
                  {clients.map(({ id, name }) => (
                     <SelectItem key={id} value={id}>
                        {name}
                     </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={NEW_CLIENT}>New client…</SelectItem>
                  {client ? <SelectItem value={RENAME_CLIENT}>Rename client…</SelectItem> : null}
               </SelectContent>
            </Select>
         ) : null}
         <ClientDialogs naming={naming} client={client} onClose={() => setNaming(null)} onCreated={onClient} />
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
