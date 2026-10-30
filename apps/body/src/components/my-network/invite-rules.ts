// The invite rules the page needs before brain answers. Body cannot import values from the CommonJS contracts package, so this copies
// `INVITE_LIMITS.noteChars` and the note's fields; invite-rules.unit.test.ts fails when they drift.
export const NOTE_CHARS = 200

// The words a note may hold that brain fills in for each person (`fillNote` in brain's inviteRules.ts).
export const NOTE_FIELDS = {
   firstName: '{first_name}',
   company: '{company}',
} as const

// Puts a field into the note where the caret was, never past what LinkedIn takes.
export const insertField = (note: string, field: string, at: number) => {
   const place = Math.max(0, Math.min(at, note.length))
   const next = `${note.slice(0, place)}${field}${note.slice(place)}`

   return next.length > NOTE_CHARS ? note : next
}
