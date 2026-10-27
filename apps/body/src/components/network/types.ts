export type Answer = 'ACCEPT' | 'IGNORE'

// What the owner sees for one request. WAITING is the only state the owner can act on; QUEUED is asked for and not yet taken;
// the rest are over. UNSURE: LinkedIn may have taken it and the page could not say. GONE: it was not on LinkedIn any more.
export type RequestState = 'WAITING' | 'QUEUED' | 'ACCEPTED' | 'IGNORED' | 'GONE' | 'UNSURE' | 'FAILED'

export type NetworkRequest = {
   // Brain's own id for the request; LinkedIn's number never reaches the page.
   id: string
   // The account that received it.
   accountId: string
   slug: string
   name: string
   headline: string
   mutual?: string
   // What the sender wrote with the request.
   note?: string
   photoUrl?: string
   state: RequestState
   // Set while QUEUED, and kept after.
   action?: Answer
   startedAt?: string
   answeredAt?: string
   // A fixed sentence, only for FAILED.
   failure?: string
}

// How one account stands.
export type AccountRead = {
   accountId: string
   // How many LinkedIn says are waiting (its own count), which can be more than were read.
   total: number
   readAt: string | null
   // When the next automatic read of the account is due (null until its time is drawn).
   nextCheckAt: string | null
   reading: boolean
   // Answers taken by this account in the last 24 hours.
   answeredToday: number
   // The account cannot be read: LinkedIn asked it to sign in again.
   problem?: 'SIGNED_OUT'
}

// The requests of the accounts that were asked for, one list for all of them, and how each account stands.
export type NetworkSnapshot = {
   requests: NetworkRequest[]
   accounts: AccountRead[]
   // The list was cut at brain's limits, so it shows less than there is.
   cut: boolean
}

// What a read asked for many accounts: the ones that were asked, and the ones left out with the sentence why. `budget` is the refusal
// the owner may go past with Start anyway.
export type ReadResult = {
   started: string[]
   skipped: Array<{ accountId: string; reason: string; budget: boolean }>
}

export type AnswerAsk = {
   id: string
   action: Answer
}

export type AskOptions = {
   // After a refusal because the account may not browse now, the owner chose to go on.
   startAnyway: boolean
}

// An answer waiting its few seconds in the browser, where it can still be undone; `until` is when it is sent (epoch ms).
export type Held = {
   action: Answer
   until: number
}
