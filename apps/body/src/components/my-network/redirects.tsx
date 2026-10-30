import { Navigate, useLocation, useParams } from 'react-router'

import { listsRedirect } from './address'
import { connectionsPage } from './filters/model'

// The old people pages open My network on the matching filter.

export const ConnectionsRedirect = () => {
   const { accountId = '' } = useParams()

   return <Navigate to={connectionsPage(accountId)} replace />
}

export const ListsRedirect = () => {
   const { search } = useLocation()

   return <Navigate to={listsRedirect(search)} replace />
}
