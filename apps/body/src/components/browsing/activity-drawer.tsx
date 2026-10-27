import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ArrowLeft, Download, Printer, X } from 'lucide-react'

import { type AccountBrowse } from './types'

import { rollUpCsv } from '../accounts/roll-up-csv'
import { downloadCsv } from '../posting/posts-csv'
import { ActivityPanel } from './activity-panel'
import { meterText } from './format'
import { limitSecondsOf, modeOf } from './modes'
import { type SampleKind } from './sample'
import { Strip } from './strip'
import { UseBar } from './use-bar'

export type ActivityTarget =
   { kind: 'account'; account: AccountBrowse } | { kind: 'client'; label: string; accounts: AccountBrowse[] }

type Props = {
   view: ActivityTarget | null
   sample: SampleKind | null
   now: Date
   onClose: () => void
   // Opens one account of a client's roll-up.
   onOpenAccount: (accountId: string) => void
}

const ClientTable = ({ accounts, onOpen }: { accounts: AccountBrowse[]; onOpen: (accountId: string) => void }) => (
   <table className="w-full text-sm">
      <thead>
         <tr className="text-muted-foreground text-left text-xs">
            <th className="py-2 pr-4 font-medium">Account</th>
            <th className="py-2 pr-4 font-medium">Browsing today</th>
            <th className="py-2 pr-4 font-medium">Last 30 days</th>
            <th className="py-2" />
         </tr>
      </thead>
      <tbody className="divide-y">
         {accounts.map(account => (
            <tr key={account.accountId}>
               <td className="py-2 pr-4">{account.email}</td>
               <td className="grid gap-1 py-2 pr-4">
                  <span className="tabular-nums">
                     {modeOf(account.mode).label} {meterText(account.usedSeconds, limitSecondsOf(account.mode))}
                  </span>
                  <UseBar usedSeconds={account.usedSeconds} limitSeconds={limitSecondsOf(account.mode)} />
               </td>
               <td className="py-2 pr-4">
                  <Strip account={account} />
               </td>
               <td className="py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => onOpen(account.accountId)}>
                     Open
                  </Button>
               </td>
            </tr>
         ))}
      </tbody>
   </table>
)

const safeName = (label: string) => label.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'client'

// The bottom drawer: the year of one account's browsing, or every account of one client side by side. It sits over the account's
// side drawer, so closing it shows that one again.
export const ActivityDrawer = ({ view, sample, now, onClose, onOpenAccount }: Props) => {
   const accounts = view?.kind === 'client' ? view.accounts : []
   const used = accounts.reduce((sum, { usedSeconds }) => sum + usedSeconds, 0)
   const limit = accounts.reduce((sum, { mode }) => sum + limitSecondsOf(mode), 0)

   return (
      <Drawer direction="bottom" open={view !== null} onOpenChange={open => (open ? undefined : onClose())}>
         <DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[70vh] data-[vaul-drawer-direction=bottom]:max-h-[85vh]">
            <DrawerHeader className="flex-row items-start justify-between gap-3 border-b text-left">
               <div className="grid gap-1">
                  <DrawerTitle>
                     {view?.kind === 'client'
                        ? `Activity: ${view.label}`
                        : view
                          ? `Browsing activity: ${view.account.email}`
                          : 'Activity'}
                  </DrawerTitle>
                  <DrawerDescription>
                     {view?.kind === 'client'
                        ? `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}, ${meterText(used, limit)} today.`
                        : 'The year of browsing, the sessions of a day and where today went.'}
                  </DrawerDescription>
               </div>
               <div className="flex items-center gap-2 print:hidden">
                  {view?.kind === 'account' ? (
                     <Button variant="outline" size="sm" onClick={onClose}>
                        <ArrowLeft />
                        Back to settings
                     </Button>
                  ) : null}
                  {view?.kind === 'client' ? (
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadCsv(`activity-${safeName(view.label)}.csv`, rollUpCsv(view.accounts))}
                     >
                        <Download />
                        Export CSV
                     </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                     <Printer />
                     Print
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Close the activity" onClick={onClose}>
                     <X />
                  </Button>
               </div>
            </DrawerHeader>
            <div className="overflow-y-auto p-4">
               {view?.kind === 'account' ? (
                  <ActivityPanel key={view.account.accountId} account={view.account} kind={sample} now={now} />
               ) : null}
               {view?.kind === 'client' ? <ClientTable accounts={view.accounts} onOpen={onOpenAccount} /> : null}
            </div>
         </DrawerContent>
      </Drawer>
   )
}
