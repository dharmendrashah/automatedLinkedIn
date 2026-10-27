import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router'

import { type Account } from '../accounts/types'

import { accountName } from './accounts'
import { type Labels, QUIET_DAYS, quietAccounts } from './landing'
import { type Publication } from './publications-list'

type Props = {
   accounts: Account[]
   // Until the posts are known nobody is called quiet.
   posts: Publication[] | undefined
   labels: Labels
   now: number
}

const OPEN_UP_TO = 3

const Client = ({ label }: { label: string | null | undefined }) =>
   label ? <Badge variant="outline">{label}</Badge> : null

// Ready accounts that have been quiet for a week. Only a hint; nothing is posted for the owner.
export const Attention = ({ accounts, posts, labels, now }: Props) => {
   const quiet = posts ? quietAccounts(accounts, posts, now) : []

   return quiet.length > 0 ? (
      <details open={quiet.length <= OPEN_UP_TO} className="rounded-xl border p-4">
         <summary className="cursor-pointer text-sm font-medium">
            No post in the last {QUIET_DAYS} days ({quiet.length})
         </summary>
         <ul className="mt-3 grid gap-2 text-sm">
            {quiet.map(account => (
               <li key={account.id} className="flex flex-wrap items-center gap-2">
                  <span dir="auto">{accountName(account)}</span>
                  <Client label={labels.get(account.id)} />
                  <Link className="underline underline-offset-4" to={`/posting/${account.id}`}>
                     Write a post
                  </Link>
               </li>
            ))}
         </ul>
      </details>
   ) : null
}
