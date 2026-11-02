import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { trpc } from '../../trpc'
import { ALL_CLIENTS } from '../my-network/address'

type Props = {
   id: string
   // The client's id; empty for all clients.
   value: string
   onChange: (clientId: string) => void
}

// The owner's clients, or all of them (kept as empty text, so a block saved before clients existed means all).
export const ClientPick = ({ id, value, onChange }: Props) => {
   const clients = trpc.people.clients.useQuery(undefined, { retry: false })

   return (
      <Select value={value || ALL_CLIENTS} onValueChange={next => onChange(next === ALL_CLIENTS ? '' : next)}>
         <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="All clients" />
         </SelectTrigger>
         <SelectContent>
            <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
            {(clients.data ?? []).map(client => (
               <SelectItem key={client.id} value={client.id}>
                  {client.name}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   )
}
