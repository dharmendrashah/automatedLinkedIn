import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Network } from 'lucide-react'
import { Link } from 'react-router'

import { type Account } from './types'

type Props = {
   accounts: Account[] | undefined
   // Ids of the accounts that have at least one proxy we can use.
   accountsWithProxy: Set<string> | undefined
}

// A paused account is not waiting for anything, and until both lists have loaded nothing is known.
export const NeedsProxyNotice = ({ accounts, accountsWithProxy }: Props) => {
   if (!accounts || !accountsWithProxy) return null

   const waiting = accounts.filter(account => account.status !== 'DISABLED' && !accountsWithProxy.has(account.id))

   if (waiting.length === 0) return null

   return (
      <Alert>
         <Network />
         <AlertTitle>
            {waiting.length === 1 ? '1 account needs a proxy' : `${waiting.length} accounts need a proxy`}
         </AlertTitle>
         <AlertDescription>
            <p>
               LinkedIn is only ever opened through a proxy, so it always looks like you are signing in from a familiar
               place. Add one and we will check {waiting.length === 1 ? 'this account' : 'these accounts'} for you
               straight away.
            </p>
            <Button asChild size="sm" className="mt-2">
               <Link to="/proxies">Add a proxy</Link>
            </Button>
         </AlertDescription>
      </Alert>
   )
}
