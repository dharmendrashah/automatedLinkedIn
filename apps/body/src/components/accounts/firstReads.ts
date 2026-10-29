import { type Account } from './types'

type Reads = Pick<Account, 'profileAskedAt' | 'invitationsReadAt' | 'connectionsReadAt' | 'messagesBackfilledAt'>

// A new account's first reads, in the order the account job asks for them (.plan/first-day-reads.md).
export const firstReadsOf = (account: Reads) => [
   { label: 'Own profile', done: account.profileAskedAt !== null },
   { label: 'Connection requests', done: account.invitationsReadAt !== null },
   { label: 'Connections', done: account.connectionsReadAt !== null },
   { label: 'Messages, the whole inbox', done: account.messagesBackfilledAt !== null },
]

export const firstReadsText = (account: Reads) => {
   const reads = firstReadsOf(account)

   return `${reads.filter(({ done }) => done).length} of ${reads.length} done`
}

export const firstReadsDone = (account: Reads) => firstReadsOf(account).every(({ done }) => done)
