import { createContext, useContext } from 'react'

import { type UniboxAccount } from './types'

import { type Index } from './inbox'

// What every part of the page reads and none changes: the accounts, which names are shared by more than one account (so their handle
// is shown too), how many messages each account got today, and the time (moved on every minute, so ages stay true).
export type Shared = {
   now: number
   accountById: ReadonlyMap<string, UniboxAccount>
   ambiguousNames: ReadonlySet<string>
   today: ReadonlyMap<string, number>
   index: Index
   // Opens a kept file of a message; absent when the data keeps none.
   openFile?: (messageId: string, index: number) => void
}

const SharedContext = createContext<Shared | undefined>(undefined)

export const SharedProvider = SharedContext.Provider

export const useShared = () => {
   const shared = useContext(SharedContext)

   if (!shared) {
      throw new Error('The Unibox parts are used outside the page.')
   }

   return shared
}
