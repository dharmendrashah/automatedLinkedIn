import { createContext, useContext } from 'react'

// What the stacked drawer can show: a company of /companies or a person by profile, or a company known only by the name a profile
// read gave (no LinkedIn link), which the owner can find and add.
export type StackRef =
   | { kind: 'company'; slug: string; name?: string }
   | { kind: 'person'; slug: string }
   | { kind: 'unknownCompany'; name: string }

// Opens a company or person in the drawer stacked on top of whatever drawer is open (.plan/company-drawer-from-person.md). null
// outside the dashboard, where nothing can be stacked.
export const DetailStackContext = createContext<((ref: StackRef) => void) | null>(null)

export const useDetailStack = () => useContext(DetailStackContext)
