import type { AccountStatus } from '../accounts/types'

export type Identity = {
   name: string
   headline: string | undefined
   imageUrl: string | undefined
   // False when only the email is known, so the preview can say how to get the real name.
   known: boolean
}

type AccountLike = {
   email: string
   displayName: string | null
   imageUrl: string | null
}

type ProfileLike = {
   name: string
   headline?: string
   imageUrl?: string
}

// Who the post is from: the stored profile when it was read, else what LinkedIn showed for the account, else the email. Nothing
// is ever invented.
export const identityOf = (account: AccountLike, profile: ProfileLike | null | undefined): Identity => {
   const name = profile?.name ?? account.displayName

   return {
      name: name ?? account.email,
      headline: profile?.headline,
      imageUrl: profile?.imageUrl ?? account.imageUrl ?? undefined,
      known: name !== null && name !== undefined,
   }
}

const REASONS: Record<Exclude<AccountStatus, 'ACTIVE'>, string> = {
   PENDING: 'Its sign-in was not checked yet. Run Test login on the accounts page.',
   NEEDS_REAUTH: 'LinkedIn asks to sign in again. Fix it on the accounts page.',
   ERROR: 'The last sign-in check failed. Look at it on the accounts page.',
   DISABLED: 'It is paused. Resume it on the accounts page.',
   BLOCKED: 'LinkedIn restricted this account.',
}

// Only an account that is signed in can be written for; why not, in a sentence, for the others.
export const ineligibleReason = (status: AccountStatus) => (status === 'ACTIVE' ? undefined : REASONS[status])
