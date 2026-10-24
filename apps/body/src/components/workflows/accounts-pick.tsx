import { accountChoices } from '../links/visit-form'
import { trpc } from '../../trpc'
import { Chips } from './setting-inputs'

// The owner's own LinkedIn accounts, any number of them; one that cannot act now says why.
export const AccountsPick = ({
   id,
   value,
   onChange,
}: {
   id: string
   value: string[]
   onChange: (next: string[]) => void
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
      <Chips
         id={id}
         options={choices.map(({ id: accountId, email, blocker }) => ({
            value: accountId,
            label: blocker ? `${email} (${blocker})` : email,
         }))}
         isOn={option => value.includes(option)}
         onToggle={option => onChange(value.includes(option) ? value.filter(each => each !== option) : [...value, option])}
      />
   )
}
