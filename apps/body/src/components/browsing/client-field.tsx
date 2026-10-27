import { Input } from '@/components/ui/input'

import { type AccountBrowse } from './types'

// The owner's own note of which client an account is for; saved when the box loses the focus, with an Undo from the caller.
export const ClientField = ({
   account,
   onChange,
}: {
   account: AccountBrowse
   onChange: (clientLabel: string | null) => void
}) => (
   <Input
      aria-label="Client"
      placeholder="Client (your own note)"
      className="h-8 w-56"
      defaultValue={account.clientLabel ?? ''}
      onBlur={event => {
         const value = event.target.value.trim()

         if (value !== (account.clientLabel ?? '')) {
            onChange(value || null)
         }
      }}
   />
)
