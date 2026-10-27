import { useLocation, useNavigate, useSearchParams } from 'react-router'

import { type Address, writeAddress } from './address'

const isDrawerState = (state: unknown) => typeof state === 'object' && state !== null && 'drawer' in state

// Opening a drawer adds one history entry, so Back closes it. Closing goes back through that entry, or just edits the address when the
// page was opened with the drawer already in it.
export const useDrawerNav = () => {
   const [params, setParams] = useSearchParams()
   const navigate = useNavigate()
   const { state } = useLocation()
   const pushed = isDrawerState(state)

   const go = (change: Partial<Address>) =>
      void navigate({ search: writeAddress(params, change).toString() }, { state: { drawer: true } })
   const close = (change: Partial<Address>) =>
      pushed ? void navigate(-1) : setParams(writeAddress(params, change), { replace: true })

   return {
      openAccount: (id: string) => go({ open: id }),
      openActivity: (id: string) => go({ open: id, panel: 'activity' }),
      openClient: (label: string) => go({ activity: label }),
      closeAccount: () => close({ open: null }),
      closePanel: () => close({ panel: null, activity: null }),
   }
}
