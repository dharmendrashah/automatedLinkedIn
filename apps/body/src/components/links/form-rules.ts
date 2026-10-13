// What an edit form sends: each field is undefined when it was left alone, null when it was emptied (so it is
// cleared), or the new value.

export const toTagList = (text: string) => [
   ...new Set(
      text
         .split(',')
         .map(tag => tag.trim().toLowerCase())
         .filter(Boolean)
   ),
]

export const textChange = (saved: string | null, typed: string) => {
   const next = typed.trim()

   return next === (saved ?? '') ? undefined : next || null
}

export const tagsChange = (saved: string[], typed: string) => {
   const tags = toTagList(typed)

   return tags.join(',') === saved.join(',') ? undefined : tags
}

export const statusChange = <S extends string>(saved: S, chosen: S) => (chosen === saved ? undefined : chosen)

export const hasChanges = (changes: Record<string, unknown>) =>
   Object.values(changes).some(value => value !== undefined)
