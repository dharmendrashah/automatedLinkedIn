import { floatingDrawer } from '@/components/floating-drawer'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

import { type AccountBrowse } from './types'

import { BrowsingPanel } from './browsing-panel'
import { type SampleKind } from './sample'

type Props = {
   account: AccountBrowse | null
   kind: SampleKind | null
   now: Date
   onClose: () => void
}

// The browsing time of one account, beside the table. It floats on the right like the other detail drawers.
export const BrowsingDrawer = ({ account, kind, now, onClose }: Props) => (
   <Drawer direction="right" open={Boolean(account)} onOpenChange={open => (open ? undefined : onClose())}>
      <DrawerContent className={floatingDrawer('data-[vaul-drawer-direction=right]:sm:max-w-4xl')}>
         <DrawerHeader className="border-b text-left">
            <DrawerTitle>{account?.email}</DrawerTitle>
            <DrawerDescription>Browsing time, daily limit and working hours.</DrawerDescription>
         </DrawerHeader>
         <div className="overflow-y-auto p-4">
            {account ? <BrowsingPanel key={account.accountId} account={account} kind={kind} now={now} /> : null}
         </div>
      </DrawerContent>
   </Drawer>
)
