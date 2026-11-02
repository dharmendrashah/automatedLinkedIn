import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ArrowLeft, Printer, X } from 'lucide-react'

import { type AccountBrowse } from './types'

import { ActivityPanel } from './activity-panel'
import { type SampleKind } from './sample'

type Props = {
   account: AccountBrowse | null
   sample: SampleKind | null
   now: Date
   onClose: () => void
}

// The bottom drawer: the year of one account's browsing. It sits over the account's side drawer, so closing it shows that one again.
export const ActivityDrawer = ({ account, sample, now, onClose }: Props) => (
   <Drawer direction="bottom" open={account !== null} onOpenChange={open => (open ? undefined : onClose())}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[70vh] data-[vaul-drawer-direction=bottom]:max-h-[85vh]">
         <DrawerHeader className="flex-row items-start justify-between gap-3 border-b text-left">
            <div className="grid gap-1">
               <DrawerTitle>{account ? `Browsing activity: ${account.email}` : 'Activity'}</DrawerTitle>
               <DrawerDescription>The year of browsing, the sessions of a day and where today went.</DrawerDescription>
            </div>
            <div className="flex items-center gap-2 print:hidden">
               {account ? (
                  <Button variant="outline" size="sm" onClick={onClose}>
                     <ArrowLeft />
                     Back to settings
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
            {account ? <ActivityPanel key={account.accountId} account={account} kind={sample} now={now} /> : null}
         </div>
      </DrawerContent>
   </Drawer>
)
