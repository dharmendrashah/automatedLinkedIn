import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { NOT_FOUND_TITLE, setPageTitle, titleFor } from '@/lib/page-title'

// Names the tab after the page the address is on, so a tab, a history entry and a bookmark say where they lead. It renders nothing.
export const PageTitle = () => {
   const { pathname } = useLocation()
   const page = titleFor(pathname) ?? NOT_FOUND_TITLE

   useEffect(() => {
      setPageTitle(page)
   }, [page])

   return null
}
