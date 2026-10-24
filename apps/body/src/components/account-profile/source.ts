import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { fullProfile } from './sample/full'
import { sparseProfile } from './sample/sparse'

// The page shows an invented profile only when the address asks for one (`?sample=full`), to look at its layouts. `full` has every
// section, `sparse` a new account's and `empty` an account whose profile was never read.
export const SAMPLE_KINDS = ['full', 'sparse', 'empty'] as const
export type SampleKind = (typeof SAMPLE_KINDS)[number]

export const SAMPLE_LABELS: Record<SampleKind, string> = {
   full: 'Full profile',
   sparse: 'New account',
   empty: 'Not read yet',
}

export const sampleKindOf = (value: string | null): SampleKind | null =>
   SAMPLE_KINDS.find(kind => kind === value) ?? null

export type LoadedProfile = {
   // Null while the profile of the account was never read.
   profile: AccountProfile | null
   sample: boolean
}

export const loadProfile = (kind: SampleKind, now: Date = new Date()): Promise<LoadedProfile> => {
   const profiles: Record<SampleKind, AccountProfile | null> = {
      full: fullProfile(now),
      sparse: sparseProfile(now),
      empty: null,
   }

   return Promise.resolve({
      profile: profiles[kind],
      sample: true,
   })
}
