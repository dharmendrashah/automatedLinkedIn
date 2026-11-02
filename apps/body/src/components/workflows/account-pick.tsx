import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { trpc } from '../../trpc'
import { accountChoices } from '../links/visit-form'

// One of the owner's own LinkedIn accounts; one that cannot act now says why.
export const AccountPick = ({
   id,
   value,
   onChange,
}: {
   id: string
   value: string
   onChange: (next: string) => void
}) => {
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const choices = accountChoices(accounts.data ?? [])

   if (accounts.isPending) {
      return <p className="text-muted-foreground text-sm">Loading accounts</p>
   }

   if (choices.length === 0) {
      return <p className="text-muted-foreground text-sm">Add a LinkedIn account first.</p>
   }

   return (
      <Select value={value || undefined} onValueChange={onChange}>
         <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Pick an account" />
         </SelectTrigger>
         <SelectContent>
            {choices.map(({ id: accountId, email, blocker }) => (
               <SelectItem key={accountId} value={accountId}>
                  {blocker ? `${email} (${blocker})` : email}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   )
}
