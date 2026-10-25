import { Mark } from '@/components/account-profile/mark'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Globe } from 'lucide-react'

import type { Identity } from './accounts'

type Props = {
   identity: Identity
   accounts: { id: string; label: string }[]
   accountId: string
   onAccount: (id: string) => void
}

// The top of the writer on the Posting page: who the post is from, chosen from the owner's accounts, and who may see it.
export const PostAs = ({ identity, accounts, accountId, onAccount }: Props) => (
   <>
      <Mark name={identity.name} imageUrl={identity.imageUrl} className="size-12 text-base" />
      <div className="grid min-w-0 gap-0.5">
         <Select value={accountId} onValueChange={onAccount}>
            <SelectTrigger
               aria-label="Post as"
               className="h-auto w-auto max-w-full gap-1 border-0 bg-transparent p-0 text-base font-semibold shadow-none focus-visible:ring-2 dark:bg-transparent dark:hover:bg-transparent"
            >
               <SelectValue />
            </SelectTrigger>
            <SelectContent>
               {accounts.map(({ id, label }) => (
                  <SelectItem key={id} value={id}>
                     {id === accountId ? identity.name : label}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
         <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Globe className="size-3" aria-hidden />
            Post to anyone
         </p>
      </div>
   </>
)
