import { createContext, useContext } from 'react'

import { type DetailRef } from './use-detail-drawer'

// Opens a company or person in the drawer stacked on top of whatever drawer is open (.plan/company-drawer-from-person.md). null
// outside the dashboard, where nothing can be stacked.
export const DetailStackContext = createContext<((ref: DetailRef) => void) | null>(null)

export const useDetailStack = () => useContext(DetailStackContext)
