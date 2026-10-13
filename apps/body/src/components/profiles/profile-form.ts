import { type LinkStatus } from '../links/types'
import { type Profile } from './types'

import { statusChange, tagsChange, textChange } from '../links/form-rules'

export type FormValues = Record<'fullName' | 'headline' | 'company' | 'location' | 'notes', string> & {
   // Comma separated, as typed.
   tags: string
   status: LinkStatus
}

export const toFormValues = (profile: Profile): FormValues => ({
   fullName: profile.fullName ?? '',
   headline: profile.headline ?? '',
   company: profile.company ?? '',
   location: profile.location ?? '',
   notes: profile.notes ?? '',
   tags: profile.tags.join(', '),
   status: profile.status,
})

export const buildChanges = (profile: Profile, values: FormValues) => ({
   fullName: textChange(profile.fullName, values.fullName),
   headline: textChange(profile.headline, values.headline),
   company: textChange(profile.company, values.company),
   location: textChange(profile.location, values.location),
   notes: textChange(profile.notes, values.notes),
   tags: tagsChange(profile.tags, values.tags),
   status: statusChange(profile.status, values.status),
})
