import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import { trpc } from '../../trpc'
import { pendingNotice } from './limits'

const POLL_MS = 120_000

// Shown only while an account holds 2,400 or more pending invites: the notice of the limits plan, with a way to the accounts.
export const PendingAlerts = () => {
   const room = trpc.linkedInAccount.room.useQuery(undefined, {
      refetchInterval: POLL_MS,
      retry: false,
   })
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const name = (id: string) => {
      const account = accounts.data?.find(entry => entry.id === id)

      return account?.displayName ?? account?.email ?? 'An account'
   }
   const notices = (room.data ?? []).flatMap(entry => {
      const text = pendingNotice(name(entry.accountId), entry)

      return text ? [{ id: entry.accountId, text }] : []
   })

   if (notices.length === 0) {
      return null
   }

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               size="sm"
               className="text-warning gap-1"
               aria-label={notices.length === 1 ? '1 account has many pending invites' : `${notices.length} accounts have many pending invites`}
            >
               <TriangleAlert />
               {notices.length}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="grid w-96 gap-2">
            <p className="text-sm font-medium">Pending invites</p>
            <ul className="grid gap-2">
               {notices.map(({ id, text }) => (
                  <li key={id} className="text-sm">
                     {text}
                  </li>
               ))}
            </ul>
            <Link to="/accounts" className="text-xs underline-offset-4 hover:underline">
               Open the accounts
            </Link>
         </PopoverContent>
      </Popover>
   )
}
