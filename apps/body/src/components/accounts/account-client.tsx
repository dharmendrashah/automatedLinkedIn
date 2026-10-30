import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

// Which client the account works for; its people on My network follow it.
export const AccountClient = ({ accountId }: { accountId: string }) => {
   const utils = trpc.useUtils()
   const clients = trpc.people.clients.useQuery(undefined, { retry: false })
   const assign = trpc.people.assignAccount.useMutation({
      onSuccess: async () => {
         toast.success('Client changed.')
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })
   const current = clients.data?.find(({ accounts }) => accounts.some(({ id }) => id === accountId))

   if (clients.error) {
      return <p className="text-destructive text-sm">{readableError(clients.error)}</p>
   }

   return (
      <div className="grid gap-1.5">
         <Select
            value={current?.id ?? ''}
            disabled={!clients.data || assign.isPending}
            onValueChange={clientId =>
               assign.mutate({
                  accountId,
                  clientId,
               })
            }
         >
            <SelectTrigger size="sm" className="w-56" aria-label="Client">
               <SelectValue placeholder="Loading clients…" />
            </SelectTrigger>
            <SelectContent>
               {clients.data?.map(({ id, name }) => (
                  <SelectItem key={id} value={id}>
                     {name}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
         <p className="text-muted-foreground text-xs">
            Its people move to this client within a minute. Add a client on My network.
         </p>
      </div>
   )
}
