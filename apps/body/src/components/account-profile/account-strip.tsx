import { TestButton } from '@/components/test-button'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/time-ago'
import { FileText, ScanEye, ScanSearch, Settings2, Users } from 'lucide-react'
import { Link } from 'react-router'

import { type Account } from '../accounts/types'

import { loginTestBlocker } from '../accounts/login-test'
import { StatusBadge } from '../accounts/status-badge'
import { visitBlocker } from '../accounts/visit'

type Props = {
   account: Pick<Account, 'email' | 'status' | 'statusMessage' | 'lastVerifiedAt'>
   // When the profile was read, or null while it never was.
   readAt: string | null
   hasWorkingProxy: boolean | undefined
   testing: boolean
   visiting: boolean
   // Why the profile cannot be read now (the server's sentence), or undefined when it can; and whether a read is going on.
   readBlocker: string | undefined
   reading: boolean
   // The page of the account's connections.
   connectionsTo: string
   onTestLogin: () => void
   onVisit: () => void
   onRead: () => void
   // Opens the account's drawer: its state, browsing time and sign-in details.
   onSettings: () => void
}

// What the app knows and can do about the account itself, under the profile's own details.
export const AccountStrip = ({
   account,
   readAt,
   hasWorkingProxy,
   testing,
   visiting,
   readBlocker,
   reading,
   connectionsTo,
   onTestLogin,
   onVisit,
   onRead,
   onSettings,
}: Props) => (
   <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="font-medium">{account.email}</span>
      <StatusBadge status={account.status} message={account.statusMessage} />
      <span className="text-muted-foreground">Last verified {timeAgo(account.lastVerifiedAt)}</span>
      <span className="text-muted-foreground">Profile read {timeAgo(readAt)}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
         <TestButton
            label="Test login"
            icon={<ScanSearch />}
            blocker={loginTestBlocker(account.status, hasWorkingProxy)}
            busy={testing}
            onClick={onTestLogin}
         />
         <TestButton
            label="Visit now"
            icon={<ScanEye />}
            blocker={visitBlocker(account.status, hasWorkingProxy)}
            busy={visiting}
            onClick={onVisit}
         />
         <TestButton
            label="Read profile"
            icon={<FileText />}
            blocker={reading ? undefined : readBlocker}
            busy={reading}
            onClick={onRead}
         />
         <Button asChild variant="outline" size="sm">
            <Link to={connectionsTo}>
               <Users />
               Connections
            </Link>
         </Button>
         <Button variant="outline" size="sm" onClick={onSettings}>
            <Settings2 />
            Account settings
         </Button>
      </div>
   </div>
)
