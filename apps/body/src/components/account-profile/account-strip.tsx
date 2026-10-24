import { TestButton } from '@/components/test-button'
import { timeAgo } from '@/lib/time-ago'
import { FileText, ScanEye, ScanSearch } from 'lucide-react'

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
   onTestLogin: () => void
   onVisit: () => void
}

// What the app knows and can do about the account itself, under the profile's own details.
export const AccountStrip = ({ account, readAt, hasWorkingProxy, testing, visiting, onTestLogin, onVisit }: Props) => (
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
            blocker="Reading the profile is not available yet."
            busy={false}
            onClick={() => undefined}
         />
      </div>
   </div>
)
