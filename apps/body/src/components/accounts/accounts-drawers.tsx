import { useEffect, useEffectEvent } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { type Account } from './types'

import { ActivityDrawer, type ActivityTarget } from '../browsing/activity-drawer'
import { type useBrowsing } from '../browsing/use-browse'
import { AccountDrawer } from './account-drawer'
import { readAddress } from './address'
import { type AccountActions } from './use-account-actions'
import { useAccountsWithProxy } from './use-accounts-with-proxy'
import { useDrawerNav } from './use-drawer-nav'
import { useToday } from './use-today'

type Props = {
   // Undefined while the list loads.
   accounts: Account[] | undefined
   browsing: ReturnType<typeof useBrowsing>
   actions: AccountActions
}

// The two drawers an address can open (`open`, `panel`, `activity`), the same on the list and on an account's own page. An id that
// is not one of the owner's accounts (a deleted one, or someone else's) closes with one message either way.
export const AccountsDrawers = ({ accounts, browsing, actions }: Props) => {
   const [params] = useSearchParams()
   const nav = useDrawerNav()
   const accountsWithProxy = useAccountsWithProxy()
   const today = useToday(accounts, browsing.byId)
   const { open, panel, activity } = readAddress(params)
   const account = accounts?.find(({ id }) => id === open) ?? null
   const browse = open ? browsing.byId?.get(open) : undefined
   const missing = accounts !== undefined && open !== null && account === null

   const onMissing = useEffectEvent(() => {
      toast.error('Account not found. It may have been removed.')
      nav.closeAccount()
   })

   useEffect(() => {
      if (missing) {
         onMissing()
      }
   }, [missing])

   const clientAccounts =
      activity && browsing.byId ? [...browsing.byId.values()].filter(({ clientLabel }) => clientLabel === activity) : []
   const target: ActivityTarget | null =
      panel === 'activity' && account && browse
         ? { kind: 'account', account: browse }
         : activity && clientAccounts.length > 0
           ? { kind: 'client', label: activity, accounts: clientAccounts }
           : null

   return (
      <>
         <AccountDrawer
            account={account}
            browse={browse}
            browseLoading={browsing.loading}
            browseError={browsing.error}
            states={open ? today.statesById?.get(open) : undefined}
            todayLoading={today.loading}
            todayError={today.error}
            sample={browsing.kind}
            actions={actions}
            accountsWithProxy={accountsWithProxy}
            onClose={nav.closeAccount}
            onActivity={() => nav.openActivity(account?.id ?? '')}
         />
         <ActivityDrawer
            view={target}
            sample={browsing.kind}
            now={browsing.now}
            onClose={nav.closePanel}
            onOpenAccount={nav.openActivity}
         />
      </>
   )
}
