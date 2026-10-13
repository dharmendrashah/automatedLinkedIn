import { type Profile, type ProfileStatus } from './types'

const TEXT_FIELDS = ['fullName', 'headline', 'company', 'location', 'notes'] as const

type TextField = (typeof TEXT_FIELDS)[number]

export type FormValues = Record<TextField, string> & {
   // Comma separated, as typed.
   tags: string
   status: ProfileStatus
}

export type Changes = Partial<Record<TextField, string | null>> & {
   tags?: string[]
   status?: ProfileStatus
}

export const toTagList = (text: string) => [
   ...new Set(
      text
         .split(',')
         .map(tag => tag.trim().toLowerCase())
         .filter(Boolean)
   ),
]

export const toFormValues = (profile: Profile): FormValues => ({
   fullName: profile.fullName ?? '',
   headline: profile.headline ?? '',
   company: profile.company ?? '',
   location: profile.location ?? '',
   notes: profile.notes ?? '',
   tags: profile.tags.join(', '),
   status: profile.status,
})

// Only what the user changed; a text field that was emptied is sent as null to clear it.
export const buildChanges = (profile: Profile, values: FormValues): Changes => {
   const changes: Changes = {}

   for (const field of TEXT_FIELDS) {
      const next = values[field].trim()

      if (next !== (profile[field] ?? '')) {
         changes[field] = next || null
      }
   }

   const tags = toTagList(values.tags)

   if (tags.join(',') !== profile.tags.join(',')) {
      changes.tags = tags
   }

   if (values.status !== profile.status) {
      changes.status = values.status
   }

   return changes
}
